/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly NG_APP_API_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
