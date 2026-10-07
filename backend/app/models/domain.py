"""Domain model — custom domains per user."""

from __future__ import annotations

import uuid
from datetime import UTC, datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Index, String, Uuid
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base


class Domain(Base):
    __tablename__ = "domains"

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        primary_key=True,
        default=uuid.uuid4,
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True),
        ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    domain: Mapped[str] = mapped_column(
        String(256), unique=True, index=True, nullable=False
    )
    # Cloudflare for SaaS: the hostname we created for this domain, and its
    # status there ("pending", "active"). Empty on a deployment that terminates
    # customer TLS itself.
    cloudflare_hostname_id: Mapped[str | None] = mapped_column(String(64), default=None)
    cloudflare_status: Mapped[str | None] = mapped_column(String(32), default=None)
    is_verified: Mapped[bool] = mapped_column(Boolean, default=False)
    is_suspended: Mapped[bool] = mapped_column(Boolean, default=False)
    verification_token: Mapped[str] = mapped_column(String(96), nullable=False)
    verification_dns_name: Mapped[str] = mapped_column(String(320), nullable=False)
    verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )
    last_checked_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        onupdate=lambda: datetime.now(UTC),
    )

    # relationships
    user = relationship("User", back_populates="domains")
    # Links live in this hostname’s slug namespace. Moving them to the default
    # domain could collide with existing slugs, so removal deletes them in both
    # the ORM and the database (links.domain_id uses ON DELETE CASCADE).
    links = relationship("Link", back_populates="domain", cascade="all, delete-orphan")
    members = relationship(
        "DomainMember", back_populates="domain", cascade="all, delete-orphan"
    )

    def __repr__(self) -> str:
        return f"<Domain {self.domain}>"


class DomainMember(Base):
    """Someone else allowed to use a domain. The owner is not a member.

    The invitation is addressed, not assigned: it carries the email it was sent
    to, and becomes usable only when the person signed in with that same address
    accepts it. That is what makes an invitation possible to someone who has no
    account yet.
    """

    __tablename__ = "domain_members"
    __table_args__ = (
        Index("ix_domain_members_lookup", "domain_id", "email", unique=True),
        Index("ix_domain_members_user", "user_id"),
        Index("ix_domain_members_token", "invite_token_hash", unique=True),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    domain_id: Mapped[uuid.UUID] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("domains.id", ondelete="CASCADE"), nullable=False
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False)
    # Null while the invitation is pending, or forever if the invitee never
    # accepts it.
    user_id: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), default=None
    )
    invited_by: Mapped[uuid.UUID | None] = mapped_column(
        Uuid(as_uuid=True), ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    # Cleared on acceptance: a spent invitation must not stay usable.
    invite_token_hash: Mapped[str | None] = mapped_column(String(64), default=None)
    invite_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )
    accepted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), default=None
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    domain = relationship("Domain", back_populates="members")
    user = relationship("User", foreign_keys=[user_id])
    inviter = relationship("User", foreign_keys=[invited_by])
