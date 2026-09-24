// Registers JustiFi's <justifi-checkout> and gives React its JSX types.
import type { Components } from '@justifi/webcomponents'
import { defineCustomElement } from '@justifi/webcomponents/dist/module/justifi-checkout'
import { defineCustomElement as defineConfigProvider } from '@justifi/webcomponents/dist/module/justifi-config-provider'
import type {} from 'react'

defineCustomElement()

// Staging by default; set both env vars to target production
// (https://wc-proxy.justifi.ai and https://components.justifi.ai). The
// provider pushes its origins into the library's shared config when it loads.
defineConfigProvider()
const provider = document.createElement('justifi-config-provider')
provider.setAttribute('api-origin', import.meta.env.VITE_JUSTIFI_API_ORIGIN || 'https://wc-proxy.justifi-staging.com')
provider.setAttribute('iframe-origin', import.meta.env.VITE_JUSTIFI_IFRAME_ORIGIN || 'https://components.justifi-staging.com')
document.body.append(provider)

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
