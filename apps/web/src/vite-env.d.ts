/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** "true" shows the demo-account hints on the login page. Not a secret: emails only. */
  readonly VITE_SHOW_DEMO_ACCOUNTS?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}
