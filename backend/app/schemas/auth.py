from typing import Literal, Optional

from pydantic import BaseModel


class SignupRequest(BaseModel):
    role: Literal["citizen", "official", "cmo"]

    # citizen fields
    name: Optional[str] = None
    mobile: Optional[str] = None
    password: Optional[str] = None
    district: Optional[str] = None
    block: Optional[str] = None
    panchayat: Optional[str] = None
    # Issued by /api/kyc/aadhaar/verify-otp; proves e-KYC was completed.
    kycToken: Optional[str] = None

    # official / cmo fields
    email: Optional[str] = None
    role_tier: Optional[str] = None
    department: Optional[str] = None
    designation: Optional[str] = None


class LoginRequest(BaseModel):
    role: Literal["citizen", "official", "cmo"]
    identifier: str
    password: str


class AdminLoginRequest(BaseModel):
    email: str
    password: str
