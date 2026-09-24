import { assertEquals, assertRejects } from 'jsr:@std/assert@1'
import type { Checkout } from '../_shared/justifi.ts'
import { type ConfirmResult, settleCheckout } from '../_shared/settle.ts'

function deps(checkout: Partial<Checkout>, outcome: ConfirmResult['outcome']) {
  const log: string[] = []
  return {
    log,
    deps: {
      justifi: {
        getCheckout: (id: string) =>
          Promise.resolve({ id, status: 'completed', payment_amount: 8500, successful_payment_id: 'py_1', ...checkout } as Checkout),
        refundPayment: (paymentId: string, amount: number, key: string) => {
          log.push(`refund ${paymentId} ${amount} ${key}`)
          return Promise.resolve({ id: 're_1', status: 'succeeded' })
        },
      },
      confirmBooking: (checkoutId: string, paymentId: string | null) => {
        log.push(`confirm ${checkoutId} ${paymentId}`)
        return Promise.resolve({ booking_id: 'b1', status: 'paid', outcome })
      },
      markRefunded: (bookingId: string) => {
        log.push(`refunded ${bookingId}`)
        return Promise.resolve()
      },
    },
  }
}

Deno.test('does nothing until the checkout is completed', async () => {
  const { deps: d, log } = deps({ status: 'attempted' }, 'paid')
  assertEquals(await settleCheckout(d, 'cho_1'), { checkoutStatus: 'attempted', outcome: null })
  assertEquals(log, [])
})

Deno.test('confirms a completed checkout with its payment id', async () => {
  const { deps: d, log } = deps({}, 'paid')
  assertEquals((await settleCheckout(d, 'cho_1')).outcome, 'paid')
  assertEquals(log, ['confirm cho_1 py_1'])
})

Deno.test('refunds a late payment whose seats were resold', async () => {
  const { deps: d, log } = deps({}, 'conflict')
  assertEquals((await settleCheckout(d, 'cho_1')).outcome, 'refunded')
  assertEquals(log, ['confirm cho_1 py_1', 'refund py_1 8500 refund-b1', 'refunded b1'])
})

Deno.test('a conflict without a payment id needs a human', async () => {
  const { deps: d } = deps({ successful_payment_id: null }, 'conflict')
  await assertRejects(() => settleCheckout(d, 'cho_1'))
})
