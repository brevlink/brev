"""Aggregate all v1 routers."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.v1 import admin, api_keys, auth, billing, domains, links, reports, users

router = APIRouter(prefix="/v1")
router.include_router(auth.router)
router.include_router(links.router)
router.include_router(domains.router)
router.include_router(api_keys.router)
router.include_router(billing.router)
router.include_router(admin.router)

router.include_router(reports.router)

router.include_router(users.router)
