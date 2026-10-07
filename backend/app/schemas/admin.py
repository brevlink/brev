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
    short_url: str
    owner_email: str
    report_count: int = 0
    latest_report_reason: str | None = None
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


class AdminListLinks(BaseModel):
    items: list[AdminLinkOut]
    total: int


class AdminReportOut(BaseModel):
    id: str
    short_url: str
    reason: str
    reporter_email: str | None
    created_at: datetime
    reviewed_at: datetime | None
    link: AdminLinkOut | None


class AdminListReports(BaseModel):
    items: list[AdminReportOut]
    total: int
