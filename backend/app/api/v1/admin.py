"""Admin and moderation router."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.admin import (
    AdminActionReason,
    AdminUserDetails,
    AdminDiagnostics,
    AdminListDomains,
    AdminCloudEntitlementUpdate,
    AdminDomainOut,
    AdminLinkOut,
    AdminListLinks,
    AdminListReports,
    AdminListUsers,
    AdminUserOut,
)
from app.services import admin as admin_service

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=AdminListUsers)
async def list_users(
    q: str = Query("", max_length=2048),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_admin_user),
):
    items, total = await admin_service.list_users(db, skip=skip, limit=limit, q=q)
    return AdminListUsers(items=items, total=total)


@router.put("/users/{user_id}/cloud-entitlement", response_model=AdminUserOut)
async def set_cloud_entitlement(
    user_id: uuid.UUID,
    body: AdminCloudEntitlementUpdate,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_admin_user),
):
    return await admin_service.set_cloud_entitlement(db, user_id, body.active, actor, body.reason)


@router.post("/users/{user_id}/suspend", response_model=AdminUserOut)
async def suspend_user(
    user_id: uuid.UUID,
    body: AdminActionReason,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_admin_user),
):
    return await admin_service.set_user_active(db, user_id, False, actor, body.reason)


@router.post("/users/{user_id}/activate", response_model=AdminUserOut)
async def activate_user(
    user_id: uuid.UUID,
    body: AdminActionReason,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_admin_user),
):
    return await admin_service.set_user_active(db, user_id, True, actor, body.reason)


@router.get("/links", response_model=AdminListLinks)
async def list_links(
    q: str = Query("", max_length=2048),
    queue: bool = True,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_admin_user),
):
    items, total = await admin_service.list_links(db, skip=skip, limit=limit, q=q, queue=queue)
    return AdminListLinks(items=items, total=total)


@router.post("/links/{link_id}/flag", response_model=AdminLinkOut)
async def flag_link(
    link_id: uuid.UUID,
    body: AdminActionReason,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_admin_user),
):
    return await admin_service.set_link_flagged(db, link_id, True, actor, body.reason)


@router.post("/links/{link_id}/clear", response_model=AdminLinkOut)
async def clear_link(
    link_id: uuid.UUID,
    body: AdminActionReason,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_admin_user),
):
    return await admin_service.set_link_flagged(db, link_id, False, actor, body.reason)


@router.get("/domains", response_model=AdminListDomains)
async def list_domains(
    q: str = Query("", max_length=2048),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_admin_user),
):
    items, total = await admin_service.list_domains(db, skip=skip, limit=limit, q=q)
    return AdminListDomains(items=items, total=total)


@router.post("/domains/{domain_id}/suspend", response_model=AdminDomainOut)
async def suspend_domain(
    domain_id: uuid.UUID,
    body: AdminActionReason,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_admin_user),
):
    return await admin_service.set_domain_suspended(db, domain_id, True, actor, body.reason)


@router.post("/domains/{domain_id}/restore", response_model=AdminDomainOut)
async def restore_domain(
    domain_id: uuid.UUID,
    body: AdminActionReason,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_admin_user),
):
    return await admin_service.set_domain_suspended(db, domain_id, False, actor, body.reason)


@router.get("/reports", response_model=AdminListReports)
async def list_reports(
    q: str = Query("", max_length=2048),
    open_only: bool = True,
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_admin_user),
):
    items, total = await admin_service.list_reports(db, skip, limit, q, open_only)
    return AdminListReports(items=items, total=total)


@router.post("/reports/{report_id}/review", status_code=204)
async def review_report(
    report_id: uuid.UUID,
    body: AdminActionReason,
    db: AsyncSession = Depends(get_db),
    actor: User = Depends(get_current_admin_user),
):
    await admin_service.review_report(db, report_id, actor, body.reason)


@router.get("/users/{user_id}", response_model=AdminUserDetails)
async def user_details(user_id: uuid.UUID, db: AsyncSession = Depends(get_db),
                       actor: User = Depends(get_current_admin_user)):
    return await admin_service.user_details(db, user_id)


@router.get("/diagnostics", response_model=AdminDiagnostics)
async def diagnostics(db: AsyncSession = Depends(get_db), actor: User = Depends(get_current_admin_user)):
    return await admin_service.diagnostics(db)
