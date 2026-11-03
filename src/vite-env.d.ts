/// <reference types="vite/client" />
interface ImportMetaEnv {
  /** Google Web OAuth client ID. Empty = sign-in hidden. Not a secret: it ships in the page. */
  readonly VITE_GOOGLE_CLIENT_ID?: string;
}
