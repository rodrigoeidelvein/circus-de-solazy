// JustiFi signs each webhook with HMAC-SHA256 over `${timestamp}.${rawBody}`,
// hex-encoded (see verifySignature in github.com/justifi-tech/justifi-node).
// TODO: confirm the header names with JustiFi; the public docs don't list them.
export const SIGNATURE_HEADER = 'justifi-signature'
export const TIMESTAMP_HEADER = 'justifi-timestamp'

const encoder = new TextEncoder()

export async function signPayload(secret: string, timestamp: string, rawBody: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
  ])
  const mac = await crypto.subtle.sign('HMAC', key, encoder.encode(`${timestamp}.${rawBody}`))
  return Array.from(new Uint8Array(mac), (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function verifySignature(
  secret: string,
  timestamp: string | null,
  rawBody: string,
  signature: string | null,
): Promise<boolean> {
  if (!timestamp || !signature) return false
  const expected = await signPayload(secret, timestamp, rawBody)
  return timingSafeEqual(expected, signature.trim().toLowerCase())
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}
