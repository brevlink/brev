"""Admin and moderation router."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_admin_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.admin import (
    AdminCloudEntitlementUpdate, AdminDomainOut, AdminLinkOut, AdminListUsers, AdminUserOut,
)
from app.services import admin as admin_service

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/users", response_model=AdminListUsers)
async def list_users(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin_user),
):
    items, total = await admin_service.list_users(db, skip=skip, limit=limit)
    return AdminListUsers(items=items, total=total)


@router.put("/users/{user_id}/cloud-entitlement", response_model=AdminUserOut)
async def set_cloud_entitlement(
    user_id: uuid.UUID,
    body: AdminCloudEntitlementUpdate,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin_user),
):
    return await admin_service.set_cloud_entitlement(db, user_id, body.active)


@router.post("/users/{user_id}/suspend", response_model=AdminUserOut)
async def suspend_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin_user),
):
    return await admin_service.set_user_active(db, user_id, False)


@router.post("/users/{user_id}/activate", response_model=AdminUserOut)
async def activate_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin_user),
):
    return await admin_service.set_user_active(db, user_id, True)


@router.get("/links", response_model=list[AdminLinkOut])
async def list_links(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin_user),
):
    return await admin_service.list_links(db, skip=skip, limit=limit)


@router.post("/links/{link_id}/flag", response_model=AdminLinkOut)
async def flag_link(
    link_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin_user),
):
    return await admin_service.set_link_flagged(db, link_id, True)


@router.post("/links/{link_id}/clear", response_model=AdminLinkOut)
async def clear_link(
    link_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin_user),
):
    return await admin_service.set_link_flagged(db, link_id, False)


@router.get("/domains", response_model=list[AdminDomainOut])
async def list_domains(
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=200),
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin_user),
):
    return await admin_service.list_domains(db, skip=skip, limit=limit)


@router.post("/domains/{domain_id}/suspend", response_model=AdminDomainOut)
async def suspend_domain(
    domain_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin_user),
):
    return await admin_service.set_domain_suspended(db, domain_id, True)


@router.post("/domains/{domain_id}/restore", response_model=AdminDomainOut)
async def restore_domain(
    domain_id: str,
    db: AsyncSession = Depends(get_db),
    _: User = Depends(get_current_admin_user),
):
    return await admin_service.set_domain_suspended(db, domain_id, False)
