export const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/** Thrown from a handler to answer with a specific status and error code. */
export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(code)
  }
}

/** Wraps a JSON POST handler with CORS preflight handling and error responses. */
export function handle(fn: (body: Record<string, unknown>, req: Request) => Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
    if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405)
    try {
      const body = await req.json().catch(() => null)
      if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'invalid_body')
      return await fn(body, req)
    } catch (error) {
      if (error instanceof HttpError) return json({ error: error.code, ...error.extra }, error.status)
      console.error(error)
      return json({ error: 'internal_error' }, 500)
    }
  }
}
