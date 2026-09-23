/**
 * Aadhaar e-KYC client.
 *
 * The 12-digit Aadhaar number is sent once to the backend, checked against the
 * UIDAI Verhoeff checksum, and discarded — only the last four digits ever come
 * back or get stored. The OTP itself is generated and verified server-side
 * (hashed at rest, hard expiry, capped attempts), so nothing about the
 * verification can be faked from the browser.
 *
 * When Twilio is configured the OTP is texted to the citizen's handset. When
 * it is not, the server returns the code and flags the session as a sandbox
 * e-KYC — the UI must show that label rather than implying a real UIDAI check.
 */

export interface OtpChallenge {
  challengeId: string;
  maskedAadhaar: string;
  maskedMobile: string;
  deliveryChannel: 'sms' | 'sandbox';
  expiresInSeconds: number;
  maxAttempts: number;
  /** Present only in sandbox mode (no SMS provider configured). */
  sandboxOtp?: string;
  notice?: string;
}

export interface OtpVerification {
  verified: boolean;
  aadhaarLast4: string;
  maskedAadhaar: string;
  mobile: string;
  deliveryChannel: 'sms' | 'sandbox';
  sandbox: boolean;
  /** Short-lived proof of this verification. Citizen signup and every
   *  grievance filing require it (or a verified citizen session). */
  kycToken: string;
  kycTokenExpiresInSeconds: number;
}

async function kycFetch(pathname: string, body: unknown) {
  const res = await fetch(pathname, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const data = await res
    .json()
    .catch(() => ({ detail: 'Server returned an invalid response.' }));
  if (!res.ok) {
    throw new Error(data.detail || data.errorMsg || 'Verification request failed.');
  }
  return data;
}

/** Step 1 — validate the Aadhaar number and dispatch an OTP. */
export async function requestAadhaarOtp(aadhaar: string, mobile: string): Promise<OtpChallenge> {
  return (await kycFetch('/api/kyc/aadhaar/request-otp', { aadhaar, mobile })) as OtpChallenge;
}

/** Step 2 — verify the OTP and receive the storable masked fragment. */
export async function verifyAadhaarOtp(challengeId: string, otp: string): Promise<OtpVerification> {
  return (await kycFetch('/api/kyc/aadhaar/verify-otp', { challengeId, otp })) as OtpVerification;
}
