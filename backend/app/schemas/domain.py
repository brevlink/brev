"""Domain-related Pydantic schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field


class DomainCreate(BaseModel):
    domain: str = Field(
        min_length=4,
        max_length=256,
        pattern=r"^([a-zA-Z0-9]+(-[a-zA-Z0-9]+)*\.)+[a-zA-Z]{2,}$",
        description="e.g. go.mario-rossi.it",
    )


class DomainOut(BaseModel):
    id: str
    user_id: str
    domain: str
    is_verified: bool
    verified_at: datetime | None
    created_at: datetime
    cname_target: str = "proxy.brevl.ink."

    model_config = {"from_attributes": True}


class DomainList(BaseModel):
    items: list[DomainOut]
    total: int