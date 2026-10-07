"""Domain-related Pydantic schemas."""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, EmailStr, Field


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
    verification_token: str
    verification_dns_name: str
    verified_at: datetime | None
    last_checked_at: datetime | None
    created_at: datetime
    cname_target: str
    # None unless the deployment drives Cloudflare for SaaS: "pending" until
    # Cloudflare has validated the hostname and issued its certificate.
    cloudflare_status: str | None = None
    # "owner" for the domain's own account, "member" for someone it was shared
    # with. Members can use the domain but not delete it, and they never receive
    # the DNS token: that one belongs to the owner.
    role: str = "owner"
    owner_email: str | None = None
    member_count: int = 0

    model_config = {"from_attributes": True}


class DomainDeletionImpact(BaseModel):
    total_links: int
    other_users_links: int


class DomainList(BaseModel):
    items: list[DomainOut]
    total: int


class DomainVerifyResponse(DomainOut):
    pass


class DomainMemberCreate(BaseModel):
    email: EmailStr = Field(
        max_length=320, description="The address to share the domain with."
    )


class DomainMemberOut(BaseModel):
    id: str
    email: str
    user_id: str | None
    accepted_at: datetime | None
    invite_expires_at: datetime | None
    created_at: datetime
    status: str

    model_config = {"from_attributes": True}


class DomainMemberList(BaseModel):
    items: list[DomainMemberOut]
    total: int


class DomainInviteAccept(BaseModel):
    token: str = Field(min_length=32, max_length=256)


class DomainInviteBootstrap(BaseModel):
    """What the acceptance page needs before anyone has signed in.

    Deliberately narrow: the domain and the address the invitation is for. The
    token is unguessable, so this is what lets the page tell someone which
    account to sign in with.
    """

    valid: bool
    domain: str | None = None
    email: str | None = None
    invited_by: str | None = None
    expires_at: datetime | None = None
