"""Privacy-minimized redirect events and durable daily totals."""
import uuid
from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text, UniqueConstraint, Uuid
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class LinkClickEvent(Base):
    __tablename__ = "link_click_events"
    __table_args__ = (UniqueConstraint("link_id", "day", "visitor_hash", name="uq_click_event_visitor"),)

    id: Mapped[uuid.UUID] = mapped_column(Uuid, primary_key=True, default=uuid.uuid4)
    link_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("links.id", ondelete="CASCADE"), index=True)
    occurred_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    country: Mapped[str | None] = mapped_column(String(2))
    referrer_host: Mapped[str | None] = mapped_column(Text)
    device: Mapped[str] = mapped_column(Text)
    visitor_hash: Mapped[str | None] = mapped_column(Text)
    hits: Mapped[int] = mapped_column(Integer, default=1, server_default="1")


class LinkClickDaily(Base):
    __tablename__ = "link_click_daily"
    __table_args__ = (UniqueConstraint("link_id", "day", name="uq_click_daily_link_day"),)

    link_id: Mapped[uuid.UUID] = mapped_column(Uuid, ForeignKey("links.id", ondelete="CASCADE"), primary_key=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    clicks: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    visitors: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
