/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** 'true' enables the manifest AWB review screen; unset means disabled. */
  readonly VITE_FF_AWB_REVIEW?: string;
}
