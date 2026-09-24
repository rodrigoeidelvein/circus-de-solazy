// Minimal JustiFi API client: just what the booking flow needs.
// https://docs.justifi.tech/api-spec

export type CheckoutStatus = 'created' | 'attempted' | 'completed' | 'expired'

export interface Checkout {
  id: string
  status: CheckoutStatus
  payment_amount: number
  successful_payment_id?: string | null
}

export interface JustifiConfig {
  clientId: string
  clientSecret: string
  /** Sub-account (acc_…) that takes the payments. */
  subAccount: string
  baseUrl?: string
  fetch?: typeof fetch
  now?: () => number
}

export class JustifiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly body: unknown,
  ) {
    super(message)
    this.name = 'JustifiError'
  }
}

// Access tokens are valid for 24 hours; refresh a little early.
const TOKEN_TTL_MS = 23 * 60 * 60 * 1000

export type JustifiClient = ReturnType<typeof createJustifiClient>

export function createJustifiClient(config: JustifiConfig) {
  const baseUrl = config.baseUrl ?? 'https://api.justifi.ai'
  const doFetch = config.fetch ?? fetch
  const now = config.now ?? Date.now
  // Cached for as long as the function instance stays warm.
  let cached: { token: string; expiresAt: number } | null = null

  async function send(path: string, init: RequestInit): Promise<unknown> {
    const res = await doFetch(`${baseUrl}${path}`, init)
    const text = await res.text()
    let body: unknown = text
    try {
      body = text ? JSON.parse(text) : null
    } catch {
      // keep the raw text
    }
    if (!res.ok) throw new JustifiError(`JustiFi ${init.method ?? 'GET'} ${path} failed with ${res.status}`, res.status, body)
    return body
  }

  async function getAccessToken(): Promise<string> {
    if (cached && cached.expiresAt > now()) return cached.token
    const body = (await send('/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_id: config.clientId, client_secret: config.clientSecret }),
    })) as { access_token: string }
    cached = { token: body.access_token, expiresAt: now() + TOKEN_TTL_MS }
    return body.access_token
  }

  async function api(
    method: 'GET' | 'POST',
    path: string,
    options: { body?: unknown; idempotencyKey?: string; subAccount?: boolean } = {},
  ): Promise<unknown> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${await getAccessToken()}`,
      Accept: 'application/json',
    }
    if (options.body !== undefined) headers['Content-Type'] = 'application/json'
    if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey
    if (options.subAccount) headers['Sub-Account'] = config.subAccount
    return send(path, {
      method,
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
    })
  }

  const data = <T>(body: unknown) => (body as { data: T }).data

  return {
    getAccessToken,

    async createCheckout(amountCents: number, description: string, idempotencyKey: string): Promise<Checkout> {
      const body = await api('POST', '/v1/checkouts', {
        body: { amount: amountCents, description },
        idempotencyKey,
        subAccount: true,
      })
      return data<Checkout>(body)
    },

    /** Token for the browser's <justifi-checkout>, scoped to this one checkout. */
    async createWebComponentToken(checkoutId: string): Promise<string> {
      const body = (await api('POST', '/v1/web_component_tokens', {
        body: { resources: [`write:checkout:${checkoutId}`, `write:tokenize:${config.subAccount}`] },
      })) as { access_token: string }
      return body.access_token
    },

    async getCheckout(checkoutId: string): Promise<Checkout> {
      return data<Checkout>(await api('GET', `/v1/checkouts/${encodeURIComponent(checkoutId)}`, { subAccount: true }))
    },

    async refundPayment(paymentId: string, amountCents: number, idempotencyKey: string): Promise<{ id: string; status: string }> {
      const body = await api('POST', `/v1/payments/${encodeURIComponent(paymentId)}/refunds`, {
        body: { amount: amountCents, reason: 'customer_request' },
        idempotencyKey,
        subAccount: true,
      })
      return data(body)
    },
  }
}

function requireEnv(name: string): string {
  const value = Deno.env.get(name)
  if (!value) throw new Error(`Missing environment variable ${name}`)
  return value
}

let fromEnv: JustifiClient | null = null

/** The client configured from Edge Function secrets, shared across requests. */
export function justifi(): JustifiClient {
  fromEnv ??= createJustifiClient({
    clientId: requireEnv('JUSTIFI_CLIENT_ID'),
    clientSecret: requireEnv('JUSTIFI_CLIENT_SECRET'),
    subAccount: requireEnv('JUSTIFI_SUB_ACCOUNT'),
    baseUrl: Deno.env.get('JUSTIFI_API_URL') || undefined,
  })
  return fromEnv
}
