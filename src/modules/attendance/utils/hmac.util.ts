import * as crypto from 'crypto';

/* Calculates HMAC-SHA256 signature for biometric payload with timestamp binding */
export function calculateHmacSignature(
  secret: string,
  payload: string | object,
  timestamp: string | number,
): string {
  const rawData = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const message = `${timestamp}.${rawData}`;
  return crypto.createHmac('sha256', secret).update(message).digest('hex');
}

/* Verifies HMAC signature with timing-safe comparison and 5-minute clock drift window */
export function verifyHmacSignature(
  secret: string,
  payload: string | object,
  timestamp: string | number,
  providedSignature: string,
  maxClockDriftSeconds = 300,
): boolean {
  if (!secret || !providedSignature) {
    return false;
  }

  const tsNum = typeof timestamp === 'string' ? parseInt(timestamp, 10) : timestamp;
  if (isNaN(tsNum)) {
    return false;
  }

  const nowSec = Math.floor(Date.now() / 1000);
  /* Normalize millisecond timestamp to seconds if applicable */
  const normalizedTs = tsNum > 100000000000 ? Math.floor(tsNum / 1000) : tsNum;

  if (Math.abs(nowSec - normalizedTs) > maxClockDriftSeconds) {
    return false;
  }

  const expectedSignature = calculateHmacSignature(secret, payload, timestamp);

  try {
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');
    const providedBuffer = Buffer.from(providedSignature, 'hex');

    if (expectedBuffer.length !== providedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
  } catch {
    return false;
  }
}
