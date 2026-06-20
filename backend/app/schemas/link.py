"""Link-related Pydantic schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, Field, HttpUrl


class LinkCreate(BaseModel):
    url: HttpUrl
    slug: str | None = Field(
        default=None,
        min_length=3,
        max_length=64,
        pattern=r"^[a-zA-Z0-9_-]+$",
        description="Custom slug. Randomly generated if omitted.",
    )
    title: str | None = Field(default=None, max_length=256)
    domain_id: str | None = None


class LinkUpdate(BaseModel):
    url: HttpUrl | None = None
    slug: str | None = Field(
        default=None,
        min_length=3,
        max_length=64,
        pattern=r"^[a-zA-Z0-9_-]+$",
    )
    title: str | None = None
    is_active: bool | None = None


class LinkOut(BaseModel):
    id: str
    user_id: str
    domain_id: str | None
    slug: str
    url: str
    title: str | None
    is_active: bool
    clicks: int
    created_at: datetime
    updated_at: datetime
    short_url: str | None = None  # computed dynamically

    model_config = {"from_attributes": True}


class LinkList(BaseModel):
    items: list[LinkOut]
    total: int