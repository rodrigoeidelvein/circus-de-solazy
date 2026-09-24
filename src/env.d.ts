interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string
  /** The anon (publishable) key: safe in the browser, it can only read seat availability. */
  readonly VITE_SUPABASE_ANON_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
