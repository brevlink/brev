"""Account settings routes."""
from fastapi import APIRouter, Depends, Request, Response
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from sqlalchemy.ext.asyncio import AsyncSession
from app.api.deps import get_current_user
from app.core.database import db_session
from app.core.rate_limit import enforce_rate_limit
from app.core.security import clear_session_cookie
from app.models.user import User
from app.schemas.account import DeleteAccountRequest, EmailChangeConfirm, EmailChangeRequest
from app.services import account

router = APIRouter(prefix="/users/me", tags=["account"])


@router.post("/email", status_code=202)
async def request_email(request: Request, body: EmailChangeRequest, db: AsyncSession = db_session, user: User = Depends(get_current_user)):
    enforce_rate_limit("account-email", identifiers=[str(user.id)], limit=5, window_seconds=3600)
    return await account.request_email_change(db, user, body)


@router.post("/email/confirm")
async def confirm_email(body: EmailChangeConfirm, db: AsyncSession = db_session):
    return await account.confirm_email_change(db, body.token)


@router.get("/export")
async def export(db: AsyncSession = db_session, user: User = Depends(get_current_user)):
    return JSONResponse(jsonable_encoder(await account.export_data(db, user)), headers={"Content-Disposition": 'attachment; filename="brev-account-data.json"', "Cache-Control": "no-store"})


@router.get("/deletion-impact")
async def impact(db: AsyncSession = db_session, user: User = Depends(get_current_user)):
    return await account.deletion_impact(db, user)


@router.delete("")
async def remove(body: DeleteAccountRequest, response: Response, db: AsyncSession = db_session, user: User = Depends(get_current_user)):
    result = await account.delete_account(db, user, body)
    clear_session_cookie(response)
    return result
