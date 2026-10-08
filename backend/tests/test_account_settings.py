"""Account settings contracts and permanent deletion."""
import re
import uuid
from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select, func

PASSWORD = "Correct-Horse-Battery-1"


def setup(client, monkeypatch):
    from app.core.config import settings
    monkeypatch.setattr(settings, "frontend_email_change_url", "http://testserver/confirm-email-change")
    response = client.post('/api/v1/auth/register', json={'email': 'owner@example.com', 'password': PASSWORD})
    uid = uuid.UUID(response.json()['id'])
    login = client.post('/api/v1/auth/login', json={'email': 'owner@example.com', 'password': PASSWORD})
    client.headers['Authorization'] = 'Bearer ' + login.json()['access_token']
    return uid


def db_run(client, operation):
    from app.core.database import async_session
    async def run():
        async with async_session() as db:
            result = await operation(db)
            await db.commit()
            return result
    return client.portal.call(run)


def request_change(client, **changes):
    return client.post('/api/v1/users/me/email', json={'email': 'new@example.com', 'current_password': PASSWORD, **changes})


def confirm(client, token):
    return client.post('/api/v1/users/me/email/confirm', json={'token': token})


def sent_token(client):
    message = next(m for m in reversed(client.test_mailer.messages) if m.subject == 'Confirm your new Brev email')
    return re.search(r'#token=([^\s]+)', message.text).group(1)


def test_email_wrong_password(client, monkeypatch):
    setup(client, monkeypatch)
    assert request_change(client, current_password='wrong').status_code == 403


def test_email_conflict(client, monkeypatch):
    setup(client, monkeypatch)
    client.post('/api/v1/auth/register', json={'email': 'taken@example.com', 'password': PASSWORD})
    assert request_change(client, email='taken@example.com').status_code == 409


def test_email_changes_only_on_single_use_confirmation_and_notifies_old(client, monkeypatch):
    setup(client, monkeypatch)
    assert request_change(client).status_code == 202
    assert client.get('/api/v1/auth/me').json()['email'] == 'owner@example.com'
    messages = client.test_mailer.messages
    assert messages[-1].recipient == 'owner@example.com'
    assert messages[-1].subject == 'Brev email change requested'
    assert '#token=' not in messages[-1].text
    token = sent_token(client)
    assert confirm(client, token).json()['email'] == 'new@example.com'
    assert confirm(client, token).status_code == 404
    assert client.get('/api/v1/auth/me').json()['email'] == 'new@example.com'


def test_email_replacement_invalidates_previous_link(client, monkeypatch):
    setup(client, monkeypatch)
    request_change(client); old = sent_token(client)
    request_change(client, email='replacement@example.com')
    assert confirm(client, old).status_code == 404
    assert confirm(client, sent_token(client)).status_code == 200


def test_email_token_expires_after_24_hours(client, monkeypatch):
    uid = setup(client, monkeypatch)
    request_change(client)
    from app.models.auth import AuthToken
    async def expire(db):
        token = await db.scalar(select(AuthToken).where(AuthToken.user_id == uid, AuthToken.purpose == 'email_change'))
        assert timedelta(hours=23, minutes=59) < token.expires_at - token.created_at < timedelta(hours=24, minutes=1)
        token.expires_at = datetime.now(UTC) - timedelta(seconds=1)
    db_run(client, expire)
    assert confirm(client, sent_token(client)).status_code == 404


def remove(client, **changes):
    return client.request('DELETE', '/api/v1/users/me', json={'current_password': PASSWORD, 'confirmation': 'DELETE', **changes})


def test_delete_requires_password_and_explicit_confirmation(client, monkeypatch):
    setup(client, monkeypatch)
    assert remove(client, current_password='wrong').status_code == 403
    assert remove(client, confirmation='yes').status_code == 422
    assert client.get('/api/v1/auth/me').status_code == 200


def test_delete_refuses_active_subscription(client, monkeypatch):
    uid = setup(client, monkeypatch)
    from app.models.subscription import Subscription
    async def seed(db):
        db.add(Subscription(user_id=uid, status='active', plan='cloud'))
    db_run(client, seed)
    response = remove(client)
    assert response.status_code == 409
    assert 'Cancel your subscription' in response.text
    assert client.get('/api/v1/auth/me').status_code == 200


def seed_data(client, uid):
    from app.models.domain import Domain, DomainMember
    from app.models.link import Link
    from app.models.api_key import APIKey
    from app.models.billing import CloudPurchase
    from app.models.subscription import Subscription
    async def seed(db):
        domain = Domain(user_id=uid, domain='example.test', verification_token='dns-secret', verification_dns_name='_brev.example.test')
        db.add(domain); await db.flush()
        db.add(Link(user_id=uid, domain_id=domain.id, slug='demo', url='https://example.org'))
        db.add(DomainMember(domain_id=domain.id, email='member@example.com', invited_by=uid, invite_token_hash='invite-secret'))
        db.add(APIKey(user_id=uid, name='CLI', prefix='brev_test', token_hash='api-secret-hash'))
        db.add(CloudPurchase(user_id=uid, stripe_checkout_session_id='cs_person', stripe_customer_id='cus_person', stripe_payment_intent_id='pi_person', stripe_price_id='price_cloud', status='paid'))
        db.add(Subscription(user_id=uid, plan='cloud', status='canceled', stripe_customer_id='cus_sub_person', stripe_subscription_id='sub_person'))
    db_run(client, seed)


def test_delete_removes_data_and_sessions_anonymizes_accounting(client, monkeypatch):
    uid = setup(client, monkeypatch); seed_data(client, uid)
    assert client.get('/api/v1/users/me/deletion-impact').json()['domains'][0]['domain'] == 'example.test'
    assert remove(client).status_code == 200
    assert client.get('/api/v1/auth/me').status_code == 401
    from app.models.user import User
    from app.models.domain import Domain, DomainMember
    from app.models.link import Link
    from app.models.api_key import APIKey
    from app.models.auth import Session, AuthToken
    from app.models.billing import CloudPurchase
    from app.models.subscription import Subscription
    async def check(db):
        for model in (User, Domain, DomainMember, Link, APIKey, Session, AuthToken):
            assert await db.scalar(select(func.count()).select_from(model)) == 0
        purchase = await db.scalar(select(CloudPurchase))
        assert purchase.user_id is None and purchase.stripe_customer_id is None and purchase.stripe_payment_intent_id is None
        assert purchase.stripe_checkout_session_id != 'cs_person'
        assert purchase.status == 'paid' and purchase.created_at
        subscription = await db.scalar(select(Subscription))
        assert subscription.user_id is None and subscription.stripe_customer_id is None and subscription.stripe_subscription_id is None
    db_run(client, check)


def test_export_attachment_contains_personal_data_without_secrets(client, monkeypatch):
    uid = setup(client, monkeypatch); seed_data(client, uid)
    response = client.get('/api/v1/users/me/export')
    assert response.status_code == 200
    assert 'attachment' in response.headers['content-disposition']
    data = response.json()
    assert data['profile']['email'] == 'owner@example.com'
    assert data['links'][0]['slug'] == 'demo'
    assert data['domains'][0]['members'][0]['email'] == 'member@example.com'
    assert data['api_keys'][0]['name'] == 'CLI'
    for secret in ('password_hash', 'token_hash', 'api-secret-hash', 'dns-secret', 'invite-secret'):
        assert secret not in response.text


@pytest.mark.parametrize('operation', ['email', 'confirm', 'delete'])
def test_account_writes_commit_before_response(client, monkeypatch, operation):
    from fastapi.testclient import TestClient
    from sqlalchemy.ext.asyncio import AsyncSession
    setup(client, monkeypatch)
    token = None
    if operation == 'confirm':
        request_change(client); token = sent_token(client)
    events = []
    commit = AsyncSession.commit
    async def record_commit(db):
        await commit(db)
        events.append(('commit', None))
    async def observer(scope, receive, send):
        async def record(message):
            if message['type'] == 'http.response.start':
                events.append(('response', message['status']))
            await send(message)
        await client.app(scope, receive, record)
    monkeypatch.setattr(AsyncSession, 'commit', record_commit)
    with TestClient(observer) as observed:
        observed.headers['Authorization'] = client.headers['Authorization']
        if operation == 'email':
            response = request_change(observed)
            expected = 202
        elif operation == 'confirm':
            response = confirm(observed, token)
            expected = 200
        else:
            response = remove(observed)
            expected = 200
        assert response.status_code == expected, response.text
    assert events == [('commit', None), ('response', expected)]


def test_email_collision_at_confirmation_keeps_original(client, monkeypatch):
    setup(client, monkeypatch)
    request_change(client)
    token = sent_token(client)
    assert client.post('/api/v1/auth/register', json={'email': 'new@example.com', 'password': PASSWORD}).status_code == 201
    assert confirm(client, token).status_code == 409
    assert client.get('/api/v1/auth/me').json()['email'] == 'owner@example.com'


def test_mail_enabled_requires_email_change_url(monkeypatch):
    from app.core.config import Settings
    from pydantic import ValidationError
    monkeypatch.setenv('JWT_SECRET', 'synthetic-secret-for-config-testing')
    with pytest.raises(ValidationError, match='FRONTEND_EMAIL_CHANGE_URL'):
        Settings(email_provider='smtp', email_from='noreply@example.com', frontend_verification_url='https://example.com/verify', frontend_password_reset_url='https://example.com/reset', frontend_email_change_url=None)
    assert Settings(email_provider='none', frontend_email_change_url=None)
