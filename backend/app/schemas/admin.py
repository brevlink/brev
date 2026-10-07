"""Admin schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class AdminUserOut(BaseModel):
    id: str
    email: str
    is_active: bool
    is_admin: bool
    is_verified: bool
    created_at: datetime
    has_cloud_entitlement: bool


class AdminCloudEntitlementUpdate(BaseModel):
    active: bool


class AdminLinkOut(BaseModel):
    id: str
    user_id: str
    slug: str
    url: str
    is_active: bool
    is_flagged: bool
    clicks: int
    created_at: datetime


class AdminDomainOut(BaseModel):
    id: str
    user_id: str
    domain: str
    is_verified: bool
    is_suspended: bool
    created_at: datetime


class AdminListUsers(BaseModel):
    items: list[AdminUserOut]
    total: int
