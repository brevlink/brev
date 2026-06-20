"""User-related Pydantic schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel


class UserOut(BaseModel):
    id: str
    email: str
    display_name: str | None
    is_verified: bool
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    display_name: str | None = None