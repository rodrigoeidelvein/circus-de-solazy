// Registers JustiFi's <justifi-checkout> and gives React its JSX types.
import type { Components } from '@justifi/webcomponents'
import { defineCustomElement } from '@justifi/webcomponents/dist/module/justifi-checkout'
import type {} from 'react'

defineCustomElement()

export type JustifiCheckoutElement = HTMLElement & Components.JustifiCheckout

declare module 'react' {
  namespace JSX {
    interface IntrinsicElements {
      'justifi-checkout': React.DetailedHTMLProps<React.HTMLAttributes<JustifiCheckoutElement>, JustifiCheckoutElement> & {
        'auth-token': string
        'checkout-id': string
        'disable-bank-account'?: boolean
      }
    }
  }
}
