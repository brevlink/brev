"""Domains router — manage custom domains."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_feature_user, get_current_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.domain import (
    DomainCreate,
    DomainInviteAccept,
    DomainInviteBootstrap,
    DomainList,
    DomainMemberCreate,
    DomainMemberList,
    DomainMemberOut,
    DomainOut,
    DomainVerifyResponse,
)
from app.services import domain_sharing as sharing
from app.services import domains as domain_service

router = APIRouter(prefix="/domains", tags=["domains"])


@router.post("", response_model=DomainOut, status_code=201)
async def create_domain(
    body: DomainCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_feature_user),
):
    return await domain_service.create_domain(db, user, body)


@router.get("", response_model=DomainList)
async def list_domains(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_feature_user),
):
    items, total = await domain_service.get_user_domains(db, str(user.id))
    return DomainList(items=items, total=total)


# ── Sharing ──────────────────────────────────────────────────────────────
# The literal paths come before the "/{domain_id}" routes on purpose: declared
# later, FastAPI would read "invites" as a domain id.


@router.get("/invites/accept", response_model=DomainInviteBootstrap)
async def inspect_invite(
    token: str = Query(min_length=32, max_length=256),
    db: AsyncSession = Depends(get_db),
):
    """Public: names the domain and the address before anyone has signed in."""
    return await sharing.inspect_invite(db, token)


@router.post("/invites/accept", response_model=DomainMemberOut)
async def accept_invite(
    body: DomainInviteAccept,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Authentication only, not the feature gate: an unverified account can accept.

    Acceptance is what gives the account somewhere to go; what the verification
    flag then locks is using the domain, which is the honest order.
    """
    return await sharing.accept_invite(db, user, body.token)


@router.get("/{domain_id}/members", response_model=DomainMemberList)
async def list_members(
    domain_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_feature_user),
):
    """Who the domain is shared with. Owner only: members just use it."""
    items, total = await sharing.list_members(db, user, domain_id)
    return DomainMemberList(items=items, total=total)


@router.post("/{domain_id}/members", response_model=DomainMemberOut, status_code=201)
async def invite_member(
    domain_id: str,
    body: DomainMemberCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_feature_user),
):
    return await sharing.invite_member(db, user, domain_id, body)


@router.delete("/{domain_id}/members/{member_id}", status_code=204)
async def remove_member(
    domain_id: str,
    member_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_feature_user),
):
    """The owner can drop any member; a member can drop himself."""
    await sharing.remove_member(db, user, domain_id, member_id)


@router.delete("/{domain_id}", status_code=204)
async def delete_domain(
    domain_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_feature_user),
):
    await domain_service.delete_domain(db, domain_id, str(user.id))


@router.post("/{domain_id}/verify", response_model=DomainVerifyResponse)
async def verify_domain(
    domain_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_feature_user),
):
    return await domain_service.verify_domain(db, domain_id, str(user.id))
