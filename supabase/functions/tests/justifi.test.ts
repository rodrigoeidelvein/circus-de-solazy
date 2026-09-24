import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import { createJustifiClient, JustifiError } from '../_shared/justifi.ts'

interface Call {
  url: string
  method: string
  headers: Record<string, string>
  body: unknown
}

/** A fetch that records requests and answers from a route table. */
function mockFetch(routes: Record<string, (call: Call) => [number, unknown]>) {
  const calls: Call[] = []
  const fetch = (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input)
    const call: Call = {
      url,
      method: init.method ?? 'GET',
      headers: Object.fromEntries(new Headers(init.headers).entries()),
      body: init.body ? JSON.parse(String(init.body)) : undefined,
    }
    calls.push(call)
    const route = routes[`${call.method} ${new URL(url).pathname}`]
    const [status, body] = route ? route(call) : [404, { error: 'no route' }]
    return Promise.resolve(new Response(JSON.stringify(body), { status }))
  }
  return { fetch: fetch as typeof globalThis.fetch, calls }
}

const token = (): [number, unknown] => [200, { access_token: 'tok_1' }]

function client(fetch: typeof globalThis.fetch, now = () => 0) {
  return createJustifiClient({
    clientId: 'cid',
    clientSecret: 'csecret',
    subAccount: 'acc_123',
    baseUrl: 'https://justifi.test',
    fetch,
    now,
  })
}

Deno.test('getAccessToken exchanges the client credentials and caches the token', async () => {
  let clock = 0
  const { fetch, calls } = mockFetch({ 'POST /oauth/token': token })
  const c = client(fetch, () => clock)

  assertEquals(await c.getAccessToken(), 'tok_1')
  assertEquals(await c.getAccessToken(), 'tok_1')
  assertEquals(calls.length, 1)
  assertEquals(calls[0].body, { client_id: 'cid', client_secret: 'csecret' })

  clock = 24 * 60 * 60 * 1000
  await c.getAccessToken()
  assertEquals(calls.length, 2, 'refreshes once the cached token is about to expire')
})

Deno.test('createCheckout sends amount, sub-account and idempotency key', async () => {
  const { fetch, calls } = mockFetch({
    'POST /oauth/token': token,
    'POST /v1/checkouts': () => [201, { id: 'cho_1', type: 'checkout', data: { id: 'cho_1', status: 'created', payment_amount: 11000 } }],
  })
  const checkout = await client(fetch).createCheckout(11000, '2 seats', 'booking-uuid')

  assertEquals(checkout.id, 'cho_1')
  const call = calls[1]
  assertEquals(call.body, { amount: 11000, description: '2 seats' })
  assertEquals(call.headers['authorization'], 'Bearer tok_1')
  assertEquals(call.headers['sub-account'], 'acc_123')
  assertEquals(call.headers['idempotency-key'], 'booking-uuid')
})

Deno.test('createWebComponentToken scopes the token to the checkout and sub-account', async () => {
  const { fetch, calls } = mockFetch({
    'POST /oauth/token': token,
    'POST /v1/web_component_tokens': () => [200, { access_token: 'wct_1', expires_in: 3600 }],
  })
  assertEquals(await client(fetch).createWebComponentToken('cho_1'), 'wct_1')
  assertEquals(calls[1].body, { resources: ['write:checkout:cho_1', 'write:tokenize:acc_123'] })
})

Deno.test('getCheckout returns the checkout data', async () => {
  const { fetch, calls } = mockFetch({
    'POST /oauth/token': token,
    'GET /v1/checkouts/cho_1': () => [
      200,
      { data: { id: 'cho_1', status: 'completed', payment_amount: 8500, successful_payment_id: 'py_1' } },
    ],
  })
  const checkout = await client(fetch).getCheckout('cho_1')
  assertEquals(checkout.status, 'completed')
  assertEquals(checkout.successful_payment_id, 'py_1')
  assertEquals(calls[1].method, 'GET')
})

Deno.test('refundPayment posts a refund with an idempotency key', async () => {
  const { fetch, calls } = mockFetch({
    'POST /oauth/token': token,
    'POST /v1/payments/py_1/refunds': () => [201, { data: { id: 're_1', status: 'succeeded' } }],
  })
  assertEquals((await client(fetch).refundPayment('py_1', 8500, 'refund-b1')).id, 're_1')
  assertEquals(calls[1].body, { amount: 8500, reason: 'customer_request' })
  assertEquals(calls[1].headers['idempotency-key'], 'refund-b1')
})

Deno.test('API errors surface as JustifiError with status and body', async () => {
  const { fetch } = mockFetch({
    'POST /oauth/token': token,
    'POST /v1/checkouts': () => [422, { error: { message: 'amount too small' } }],
  })
  const error = await assertRejects(() => client(fetch).createCheckout(1, 'x', 'k'), JustifiError)
  assertEquals(error.status, 422)
  assertEquals(error.body, { error: { message: 'amount too small' } })
})
