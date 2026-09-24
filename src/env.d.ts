interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  /** The anon (publishable) key: safe in the browser, it can only read seat availability. */
  readonly VITE_SUPABASE_ANON_KEY: string
  /** JustiFi web component origins; unset means staging. */
  readonly VITE_JUSTIFI_API_ORIGIN?: string
  readonly VITE_JUSTIFI_IFRAME_ORIGIN?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
