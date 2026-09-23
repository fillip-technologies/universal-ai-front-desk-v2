"""FastAPI dependencies: a per-request Postgres session, plus resolution of
the current authenticated citizen / official / admin from the
Authorization: Bearer <jwt> header."""
import uuid
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from .db import get_session
from .models.admin import Admin
from .models.citizen import Citizen
from .models.cmo_user import CmoUser
from .models.official import Official
from .security import decode_access_token

bearer_scheme = HTTPBearer(auto_error=False)

# Re-exported so routers can depend on the session without importing db directly.
DbSession = Depends(get_session)


def _unauthorized(detail: str = "Session expired or invalid.") -> HTTPException:
    return HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


def _as_uuid(value: str) -> Optional[uuid.UUID]:
    try:
        return uuid.UUID(str(value))
    except (ValueError, AttributeError, TypeError):
        return None


async def get_optional_token(
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
):
    if not creds:
        return None
    return decode_access_token(creds.credentials)


async def get_current_citizen(
    token=Depends(get_optional_token),
    session: AsyncSession = Depends(get_session),
) -> Citizen:
    if not token or token.role != "citizen":
        raise _unauthorized()
    citizen_id = _as_uuid(token.subject)
    if citizen_id is None:
        raise _unauthorized()
    citizen = await session.get(Citizen, citizen_id)
    if not citizen:
        raise _unauthorized()
    return citizen


async def get_current_official(
    token=Depends(get_optional_token),
    session: AsyncSession = Depends(get_session),
) -> Official:
    if not token or token.role != "official":
        raise _unauthorized()
    official_id = _as_uuid(token.subject)
    if official_id is None:
        raise _unauthorized()
    official = await session.get(Official, official_id)
    if not official:
        raise _unauthorized()
    return official


async def get_current_cmo(
    token=Depends(get_optional_token),
    session: AsyncSession = Depends(get_session),
) -> CmoUser:
    """A CMO Monitor account. Official and citizen tokens never pass here —
    the CMO Monitor has its own login."""
    if not token or token.role != "cmo":
        raise _unauthorized("CMO Monitor sign-in required.")
    cmo_id = _as_uuid(token.subject)
    cmo = await session.get(CmoUser, cmo_id) if cmo_id else None
    if not cmo:
        raise _unauthorized("CMO Monitor sign-in required.")
    return cmo


async def get_approved_cmo(cmo: CmoUser = Depends(get_current_cmo)) -> CmoUser:
    if not cmo.approved:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Your CMO Monitor account is awaiting approval by the system administrator.",
        )
    return cmo


async def get_current_admin(
    token=Depends(get_optional_token),
    session: AsyncSession = Depends(get_session),
) -> Admin:
    if not token or token.role != "admin":
        raise _unauthorized("Admin authentication required.")
    admin_id = _as_uuid(token.subject)
    if admin_id is None:
        raise _unauthorized("Admin authentication required.")
    admin = await session.get(Admin, admin_id)
    if not admin:
        raise _unauthorized("Admin authentication required.")
    return admin


async def get_current_user(
    token=Depends(get_optional_token),
    session: AsyncSession = Depends(get_session),
) -> dict:
    """Used by /api/auth/me — resolves whichever role the token carries."""
    if not token:
        raise _unauthorized()
    subject_id = _as_uuid(token.subject)
    if subject_id is None:
        raise _unauthorized()
    if token.role == "citizen":
        citizen = await session.get(Citizen, subject_id)
        if not citizen:
            raise _unauthorized()
        return {"role": "citizen", "citizen": citizen.to_public()}
    if token.role == "official":
        official = await session.get(Official, subject_id)
        if not official:
            raise _unauthorized()
        return {"role": "official", "official": official.to_public()}
    if token.role == "cmo":
        cmo = await session.get(CmoUser, subject_id)
        if not cmo:
            raise _unauthorized()
        return {"role": "cmo", "cmo": cmo.to_public()}
    raise _unauthorized()
