"""Personal data export, verified email changes and permanent deletion."""
from datetime import UTC, datetime
import uuid

from fastapi import HTTPException
from sqlalchemy import delete, inspect, or_, select, update, MetaData, Table
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.security import verify_password
from app.models.auth import AuthToken, Session
from app.models.api_key import APIKey
from app.models.billing import AdminAction, CheckoutGuard, CloudEntitlement, CloudPurchase
from app.models.domain import Domain, DomainMember
from app.models.link import Link
from app.models.report import Report
from app.models.subscription import Subscription
from app.models.user import User
from app.services import auth

CHANGE_PURPOSE = "email_change"


def check_password(user, password):
    if not verify_password(password, user.password_hash):
        raise HTTPException(403, "Current password is incorrect")


async def lock_user(db, user):
    locked = await db.scalar(
        select(User).where(User.id == user.id).with_for_update().execution_options(populate_existing=True)
    )
    if locked is None:
        raise HTTPException(401, "User no longer exists")
    return locked


async def request_email_change(db, user, body):
    user = await lock_user(db, user)
    check_password(user, body.current_password)
    email = auth._email(body.email)
    if await db.scalar(select(User.id).where(User.email == email)):
        raise HTTPException(409, "Email already registered")
    await auth._ensure_mailer()
    token = await auth._issue_token(db, user, purpose=CHANGE_PURPOSE, ttl_minutes=1440)
    record = await auth._inspect_token(db, token, CHANGE_PURPOSE)
    record.pending_email = email
    url = auth._frontend_token_url(settings.frontend_email_change_url, token)
    await auth._send_mail(recipient=email, subject="Confirm your new Brev email", text=f"Confirm your new Brev email address:\n{url}\n\nYour email will change only after confirmation. This single-use link expires in 24 hours.")
    await auth._send_mail(recipient=user.email, subject="Brev email change requested", text=f"A change of your Brev email to {email} was requested. Your current email has not changed. If you did not request this, change your password and contact support.")
    return {"message": "Confirmation sent to your new email; your current email has been notified."}


async def confirm_email_change(db, token):
    # Use the same user lock as requests/deletion to serialize competing changes.
    record = await auth._inspect_token(db, token, CHANGE_PURPOSE)
    user = await db.scalar(select(User).where(User.id == record.user_id).with_for_update())
    if user is None or not user.is_active:
        raise HTTPException(404, "Invalid or expired token")
    record = await auth._consume_token(db, token, CHANGE_PURPOSE)
    if await db.scalar(select(User.id).where(User.email == record.pending_email)):
        raise HTTPException(409, "Email already registered")
    user.email = record.pending_email
    user.is_verified = True
    user.email_verified_at = datetime.now(UTC)
    # Old-address verification/reset links must not remain usable.
    await db.execute(update(AuthToken).where(AuthToken.user_id == user.id, AuthToken.used_at.is_(None)).values(used_at=datetime.now(UTC)))
    try:
        await db.flush()
    except IntegrityError:
        raise HTTPException(409, "Email already registered") from None
    return {"email": user.email, "message": "Email changed."}


def fields(row, names):
    return {name: getattr(row, name) for name in names.split()}


async def export_data(db, user):
    links = (await db.scalars(select(Link).where(Link.user_id == user.id))).all()
    domains = (await db.scalars(select(Domain).where(Domain.user_id == user.id))).all()
    memberships = (await db.scalars(select(DomainMember).where(or_(DomainMember.user_id == user.id, DomainMember.email == user.email)))).all()
    domain_data = []
    for domain in domains:
        members = (await db.scalars(select(DomainMember).where(DomainMember.domain_id == domain.id))).all()
        domain_data.append({**fields(domain, "id domain is_verified is_suspended created_at updated_at"), "members": [fields(m, "id email user_id accepted_at created_at") for m in members]})
    keys = (await db.scalars(select(APIKey).where(APIKey.user_id == user.id))).all()
    # Optional aggregate tables are discovered without importing another worktree's models.
    connection = await db.connection()
    def aggregates(sync):
        result = []
        for name in inspect(sync).get_table_names():
            columns = {column["name"] for column in inspect(sync).get_columns(name)}
            counts = columns.intersection({"clicks", "count", "click_count", "total_clicks"})
            dates = columns.intersection({"day", "date"})
            if "link_id" in columns and dates and counts:
                table = Table(name, MetaData(), autoload_with=sync)
                selected = [table.c[column] for column in sorted({"link_id"} | dates | counts)]
                result.extend(dict(r) for r in sync.execute(select(*selected).where(table.c.link_id.in_(select(Link.id).where(Link.user_id == user.id)))).mappings())
        return result
    daily = await connection.run_sync(aggregates)
    return {"exported_at": datetime.now(UTC), "profile": fields(user, "id email display_name is_verified created_at updated_at"), "links": [fields(l, "id domain_id slug url title is_active is_flagged clicks created_at updated_at") for l in links], "domains": domain_data, "memberships": [fields(m, "id domain_id email accepted_at created_at") for m in memberships], "api_keys": [fields(k, "id name prefix is_active last_used_at created_at") for k in keys], "daily_clicks": daily}


async def deletion_impact(db, user):
    domains = (await db.scalars(select(Domain).where(Domain.user_id == user.id))).all()
    return {"domains": [fields(d, "id domain") for d in domains]}


async def delete_account(db: AsyncSession, user, body):
    user = await lock_user(db, user)
    check_password(user, body.current_password)
    subscription = await db.scalar(select(Subscription).where(Subscription.user_id == user.id).with_for_update())
    if subscription and subscription.plan != "free" and subscription.status in {"active", "trialing", "past_due", "unpaid", "incomplete", "paused"}:
        raise HTTPException(409, "Cancel your subscription before deleting your account.")
    domain_ids = select(Domain.id).where(Domain.user_id == user.id)
    link_ids = select(Link.id).where(or_(Link.user_id == user.id, Link.domain_id.in_(domain_ids)))
    await db.execute(delete(Report).where(or_(Report.link_id.in_(link_ids), Report.reporter_email == user.email)))
    await db.execute(delete(AdminAction).where(or_(AdminAction.actor_id == user.id, AdminAction.account_id == user.id, AdminAction.target_id == user.id, AdminAction.target_id.in_(domain_ids), AdminAction.target_id.in_(link_ids))))
    await db.execute(delete(DomainMember).where(or_(DomainMember.domain_id.in_(domain_ids), DomainMember.user_id == user.id, DomainMember.email == user.email)))
    await db.execute(update(DomainMember).where(DomainMember.invited_by == user.id).values(invited_by=None))
    await db.execute(delete(Link).where(Link.id.in_(link_ids)))
    await db.execute(delete(Domain).where(Domain.user_id == user.id))
    for model in (APIKey, Session, AuthToken, CheckoutGuard, CloudEntitlement):
        await db.execute(delete(model).where(model.user_id == user.id))
    purchases = (await db.scalars(select(CloudPurchase).where(CloudPurchase.user_id == user.id))).all()
    for purchase in purchases:
        purchase.user_id = None
        purchase.stripe_customer_id = None
        purchase.stripe_payment_intent_id = None
        purchase.stripe_checkout_session_id = f"anonymous_{uuid.uuid4().hex}"
    if subscription:
        subscription.user_id = None
        subscription.stripe_customer_id = None
        subscription.stripe_subscription_id = None
    await db.flush()
    # Bulk deletion avoids the ORM's delete-orphan accounting cascade.
    await db.execute(delete(User).where(User.id == user.id))
    return {"message": "Account, links, owned domains, memberships, API keys, sessions and tokens deleted. Billing records remain anonymized for accounting obligations."}
