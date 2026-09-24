// Receives JustiFi webhooks. Deployed with --no-verify-jwt (JustiFi can't send
// a Supabase token), so the signature is the only authentication.
import { corsHeaders, json } from '../_shared/cors.ts'
import { db } from '../_shared/db.ts'
import { settleDeps } from '../_shared/deps.ts'
import { settleCheckout } from '../_shared/settle.ts'
import { SIGNATURE_HEADER, TIMESTAMP_HEADER, verifySignature } from '../_shared/webhookSignature.ts'

interface WebhookEvent {
  id: string
  event_name?: string
  type?: string
  data?: { id?: string; checkout_id?: string }
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method not allowed', { status: 405, headers: corsHeaders })

  const secret = Deno.env.get('JUSTIFI_WEBHOOK_SECRET')
  if (!secret) {
    console.error('JUSTIFI_WEBHOOK_SECRET is not set')
    return json({ error: 'not_configured' }, 500)
  }

  const rawBody = await req.text()
  const valid = await verifySignature(
    secret,
    req.headers.get(TIMESTAMP_HEADER),
    rawBody,
    req.headers.get(SIGNATURE_HEADER),
  )
  if (!valid) return json({ error: 'invalid_signature' }, 401)

  let event: WebhookEvent
  try {
    event = JSON.parse(rawBody)
  } catch {
    return json({ error: 'invalid_body' }, 400)
  }
  const type = event.event_name ?? event.type ?? 'unknown'
  if (!event.id) return json({ error: 'invalid_body' }, 400)

  const { data: seen, error: seenError } = await db.from('webhook_events').select('id').eq('id', event.id).maybeSingle()
  if (seenError) throw seenError
  if (seen) return json({ received: true, duplicate: true })

  if (type === 'checkout.completed') {
    const checkoutId = event.data?.id?.startsWith('cho_') ? event.data.id : event.data?.checkout_id
    if (checkoutId) {
      try {
        // settleCheckout re-reads the checkout from JustiFi, so the payload is only used for its id.
        await settleCheckout(settleDeps(), checkoutId)
      } catch (error) {
        console.error(`Settling ${checkoutId} for event ${event.id} failed`, error)
        // Not recorded as processed, so JustiFi's retry gets another go.
        return json({ error: 'processing_failed' }, 500)
      }
    }
  }

  // Record after processing: a crash in between means a harmless re-run (settling is idempotent).
  const { error } = await db.from('webhook_events').upsert({ id: event.id, type }, { ignoreDuplicates: true })
  if (error) console.error('Recording webhook event failed', error)
  return json({ received: true })
})
