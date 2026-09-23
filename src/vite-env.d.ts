/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** 'true' enables the v2 human-confirmed AWB matching screens; unset means disabled. */
  readonly VITE_FF_V2_FLOW?: string;
}
