/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_BACKEND_PORT?: string;
  readonly VITE_BACKEND_HOST?: string;
  readonly VITE_BACKEND_PROTOCOL?: string;
  readonly VITE_AGENTOS_BASE_URL?: string;
  readonly VITE_AGENTOS_STREAM_PATH?: string;
  readonly VITE_AGENTOS_WORKFLOW_DEFINITIONS_PATH?: string;
  readonly VITE_AGENTOS_PERSONAS_PATH?: string;
  readonly VITE_AGENTOS_WITH_CREDENTIALS?: string;
  readonly VITE_AGENTOS_WORKBENCH_USER_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
