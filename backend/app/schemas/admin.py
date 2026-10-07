"""Admin schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, field_validator


class AdminUserOut(BaseModel):
    id: str
    email: str
    is_active: bool
    is_admin: bool
    is_verified: bool
    created_at: datetime
    has_cloud_entitlement: bool


class AdminActionReason(BaseModel):
    reason: str = Field(min_length=1, max_length=1000)

    @field_validator("reason")
    @classmethod
    def nonempty_reason(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("A reason is required")
        return value.strip()


class AdminCloudEntitlementUpdate(AdminActionReason):
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
    owner_email: str
    is_verified: bool
    verified_at: datetime | None
    certificate_state: str
    last_checked_at: datetime | None
    updated_at: datetime
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


class AdminActionOut(BaseModel):
    actor_id: str
    actor_email: str
    action: str
    target_type: str
    target_id: str
    reason: str
    created_at: datetime


class AdminPurchaseOut(BaseModel):
    id: str
    status: str
    created_at: datetime
    paid_at: datetime | None
    updated_at: datetime


class AdminUserDetails(BaseModel):
    user: AdminUserOut
    effective_access: bool
    cloud_mode: bool
    entitlement_status: str | None
    entitlement_source: str
    entitlement_granted_at: datetime | None
    entitlement_updated_at: datetime | None
    source_purchase_id: str | None
    purchases: list[AdminPurchaseOut]
    legacy_status: str | None
    legacy_current_period_end: datetime | None
    actions: list[AdminActionOut]
    observed_at: datetime


class AdminListDomains(BaseModel):
    items: list[AdminDomainOut]
    total: int


class AdminIntegrationOut(BaseModel):
    name: str
    configured: bool
    health: str = "Not verified"
    observed_at: datetime


class AdminWebhookOut(BaseModel):
    event_type: str
    status: str
    failure_reason: str | None
    created_at: datetime
    processed_at: datetime | None


class AdminDiagnostics(BaseModel):
    cloud_mode: bool
    observed_at: datetime
    database_verified_at: datetime
    integrations: list[AdminIntegrationOut]
    recent_webhooks: list[AdminWebhookOut]
    pending_certificates: list[AdminDomainOut]
    pending_certificates_total: int
