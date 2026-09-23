"""Password hashing and JWT issuance/verification."""
from datetime import datetime, timedelta, timezone
from typing import Literal, Optional

from jose import JWTError, jwt
from passlib.context import CryptContext

from .config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

Role = Literal["citizen", "official", "cmo", "admin"]


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return pwd_context.verify(password, password_hash)
    except Exception:
        return False


def create_access_token(*, subject: str, role: Role) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.jwt_expires_days)
    payload = {"sub": subject, "role": role, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


class TokenData:
    def __init__(self, subject: str, role: Role):
        self.subject = subject
        self.role = role


KYC_TOKEN_MINUTES = 30


class KycClaims:
    """Proof that a completed Aadhaar OTP challenge vouches for a mobile."""

    def __init__(self, challenge_id: str, aadhaar_last4: str, mobile: str):
        self.challenge_id = challenge_id
        self.aadhaar_last4 = aadhaar_last4
        self.mobile = mobile  # 10-digit normalized

    @property
    def masked_aadhaar(self) -> str:
        return f"XXXX-XXXX-{self.aadhaar_last4}"


def create_kyc_token(*, challenge_id: str, aadhaar_last4: str, mobile: str) -> str:
    """Short-lived token issued by a successful OTP verification. Signup and
    complaint filing demand it, so verification cannot be skipped by simply
    claiming it happened. Carries a distinct `typ` so it can never be mistaken
    for a session token."""
    expire = datetime.now(timezone.utc) + timedelta(minutes=KYC_TOKEN_MINUTES)
    payload = {"typ": "kyc", "sub": challenge_id, "last4": aadhaar_last4, "mobile": mobile, "exp": expire}
    return jwt.encode(payload, settings.jwt_secret, algorithm=settings.jwt_algorithm)


def decode_kyc_token(token: Optional[str]) -> Optional[KycClaims]:
    if not token:
        return None
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
    if payload.get("typ") != "kyc" or not payload.get("sub"):
        return None
    last4, mobile = str(payload.get("last4", "")), str(payload.get("mobile", ""))
    if len(last4) != 4 or len(mobile) != 10:
        return None
    return KycClaims(challenge_id=payload["sub"], aadhaar_last4=last4, mobile=mobile)


def decode_access_token(token: str) -> Optional[TokenData]:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return None
    if payload.get("typ") == "kyc":
        return None
    sub = payload.get("sub")
    role = payload.get("role")
    if not sub or role not in ("citizen", "official", "cmo", "admin"):
        return None
    return TokenData(subject=sub, role=role)
