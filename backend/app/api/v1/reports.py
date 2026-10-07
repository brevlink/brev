"""Public abuse reporting does not require a session or an account."""
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.rate_limit import rate_limit
from app.schemas.report import ReportAccepted, ReportCreate
from app.services.reports import create_report

router = APIRouter(prefix="/reports", tags=["reports"])


@router.post("", status_code=201, response_model=ReportAccepted,
             dependencies=[Depends(rate_limit("reports-create", 5, 3600))])
async def report_link(body: ReportCreate, db: AsyncSession = Depends(get_db)):
    await create_report(db, body)
    return ReportAccepted()
