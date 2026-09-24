import { assertEquals } from 'jsr:@std/assert@1'
import { signPayload, verifySignature } from '../_shared/webhookSignature.ts'

const body = '{"id":"evt_1","event_name":"checkout.completed","data":{"id":"cho_1"}}'

Deno.test('signs HMAC-SHA256 over "timestamp.body" as hex', async () => {
  // Reference value: printf '%s' "1700000000.$body" | openssl dgst -sha256 -hmac sec_test
  assertEquals(
    await signPayload('sec_test', '1700000000', body),
    '343be6d73962dfc59a07d9b7f98b138ab6b41a37257d8e2cd7f764de1ed7414b',
  )
})

Deno.test('accepts a valid signature and rejects tampering', async () => {
  const signature = await signPayload('sec_test', '1700000000', body)
  assertEquals(await verifySignature('sec_test', '1700000000', body, signature), true)
  assertEquals(await verifySignature('sec_test', '1700000001', body, signature), false)
  assertEquals(await verifySignature('sec_test', '1700000000', body + ' ', signature), false)
  assertEquals(await verifySignature('other', '1700000000', body, signature), false)
  assertEquals(await verifySignature('sec_test', null, body, signature), false)
  assertEquals(await verifySignature('sec_test', '1700000000', body, null), false)
})
