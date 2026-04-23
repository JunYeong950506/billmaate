/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_AI_CENTRAL_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
