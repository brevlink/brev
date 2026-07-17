"""Billing router for Brev Cloud."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_feature_user
from app.core.database import get_db
from app.models.user import User
from app.schemas.billing import BillingStatus, CheckoutSessionResponse
from app.services import billing as billing_service

router = APIRouter(prefix="/billing", tags=["billing"])


@router.get("/status", response_model=BillingStatus)
async def billing_status(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_feature_user),
):
    return await billing_service.get_billing_status(db, user)


@router.post("/checkout", response_model=CheckoutSessionResponse)
async def checkout(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_feature_user),
):
    url = await billing_service.create_checkout_session(db, user)
    return CheckoutSessionResponse(url=url)


@router.post("/webhook")
async def stripe_webhook(
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    return await billing_service.handle_stripe_webhook(db, request)
