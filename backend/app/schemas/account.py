"""Account settings request contracts."""
from typing import Literal
from pydantic import BaseModel, EmailStr, Field


class EmailChangeRequest(BaseModel):
    email: EmailStr
    current_password: str = Field(min_length=1, max_length=1024)


class EmailChangeConfirm(BaseModel):
    token: str = Field(min_length=32, max_length=256)


class DeleteAccountRequest(BaseModel):
    current_password: str = Field(min_length=1, max_length=1024)
    confirmation: Literal["DELETE"]
