"""Bounded public input; the response does not disclose link ownership."""
from pydantic import BaseModel, ConfigDict, EmailStr, Field


class ReportCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    short_url: str = Field(min_length=1, max_length=2048)
    reason: str = Field(min_length=1, max_length=2000)
    reporter_email: EmailStr | None = Field(default=None, max_length=320)


class ReportAccepted(BaseModel):
    message: str = "Thank you. Your report has been submitted for review."
