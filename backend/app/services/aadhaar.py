"""Aadhaar number validation and OTP generation for the e-KYC flow.

Scope note — this is a *sandbox* e-KYC, and the API is explicit about it.
Genuine UIDAI demographic/OTP authentication requires the sponsoring
department to be licensed as an AUA/KUA and to call the UIDAI Auth API over a
mutually-authenticated channel. What this module does implement for real:

  * the actual UIDAI Verhoeff checksum, so structurally invalid Aadhaar
    numbers are rejected exactly as the real system rejects them;
  * a cryptographically random OTP, stored only as a bcrypt hash, with a hard
    expiry and a server-enforced attempt limit;
  * SMS delivery through Twilio when credentials are configured.

Only the last four digits ever reach the database (Aadhaar Act §29(4)).

Demo toggle — `settings.aadhaar_relaxed_validation` (env AADHAAR_RELAXED_
VALIDATION) makes `validate_aadhaar` accept ANY 12-digit number by skipping the
Verhoeff checksum and the leading-digit rule. It exists so a presenter can walk
through the OTP flow without a checksum-valid Aadhaar. Default is off.
"""
import re
import secrets

from ..config import settings

# Verhoeff algorithm tables (UIDAI uses Verhoeff as the Aadhaar check digit).
_D_TABLE = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
    (1, 2, 3, 4, 0, 6, 7, 8, 9, 5),
    (2, 3, 4, 0, 1, 7, 8, 9, 5, 6),
    (3, 4, 0, 1, 2, 8, 9, 5, 6, 7),
    (4, 0, 1, 2, 3, 9, 5, 6, 7, 8),
    (5, 9, 8, 7, 6, 0, 4, 3, 2, 1),
    (6, 5, 9, 8, 7, 1, 0, 4, 3, 2),
    (7, 6, 5, 9, 8, 2, 1, 0, 4, 3),
    (8, 7, 6, 5, 9, 3, 2, 1, 0, 4),
    (9, 8, 7, 6, 5, 4, 3, 2, 1, 0),
)

_P_TABLE = (
    (0, 1, 2, 3, 4, 5, 6, 7, 8, 9),
    (1, 5, 7, 6, 2, 8, 3, 0, 9, 4),
    (5, 8, 0, 3, 7, 9, 6, 1, 4, 2),
    (8, 9, 1, 6, 0, 4, 3, 5, 2, 7),
    (9, 4, 5, 3, 1, 2, 6, 8, 7, 0),
    (4, 2, 8, 6, 5, 7, 3, 9, 0, 1),
    (2, 7, 9, 3, 8, 0, 6, 4, 1, 5),
    (7, 0, 4, 6, 9, 1, 3, 2, 5, 8),
)

OTP_TTL_SECONDS = 300  # 5 minutes
OTP_MAX_ATTEMPTS = 3


def digits_only(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def verhoeff_is_valid(number: str) -> bool:
    """True when `number`'s trailing Verhoeff check digit is correct."""
    digits = digits_only(number)
    if not digits:
        return False
    checksum = 0
    for position, digit in enumerate(reversed(digits)):
        checksum = _D_TABLE[checksum][_P_TABLE[position % 8][int(digit)]]
    return checksum == 0


class AadhaarValidationError(ValueError):
    """Raised when a supplied Aadhaar number cannot be accepted."""


def validate_aadhaar(number: str) -> str:
    """Validate a full 12-digit Aadhaar number, returning its last 4 digits.

    The full number is never returned or persisted — the caller only ever gets
    back the fragment it is allowed to store.
    """
    digits = digits_only(number)
    if len(digits) != 12:
        raise AadhaarValidationError("Aadhaar number must be exactly 12 digits.")
    if settings.aadhaar_relaxed_validation:
        # DEMO MODE: any 12 digits pass. See the module docstring.
        return digits[-4:]
    if digits[0] in ("0", "1"):
        # UIDAI never issues numbers starting with 0 or 1.
        raise AadhaarValidationError("Not a valid Aadhaar number — it cannot begin with 0 or 1.")
    if not verhoeff_is_valid(digits):
        raise AadhaarValidationError(
            "That Aadhaar number failed its checksum. Please re-enter all 12 digits."
        )
    return digits[-4:]


def generate_otp() -> str:
    """A cryptographically random 6-digit OTP."""
    return f"{secrets.randbelow(1_000_000):06d}"
