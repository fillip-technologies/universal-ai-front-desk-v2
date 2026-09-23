import uuid

from pydantic import BaseModel, Field


class RequestOtpRequest(BaseModel):
    # Full 12-digit Aadhaar. Validated against the UIDAI Verhoeff checksum and
    # then discarded — only the last 4 digits are ever persisted.
    aadhaar: str = Field(min_length=12, max_length=20)
    mobile: str = Field(min_length=10, max_length=20)


class VerifyOtpRequest(BaseModel):
    challengeId: uuid.UUID
    otp: str = Field(min_length=4, max_length=10)
