"""Billing schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class BillingStatus(BaseModel):
    status: str
    plan: str
    active: bool
    current_period_end: datetime | None = None
    billing_type: str = "none"
    cloud_mode: bool
    included_custom_domains: int


class CheckoutSessionResponse(BaseModel):
    url: str
