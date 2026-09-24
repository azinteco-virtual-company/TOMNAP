/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

interface ImportMetaEnv {
  /** 'true' enables the manifest AWB review screen; unset means disabled. */
  readonly VITE_FF_AWB_REVIEW?: string;
  /** 'true' adds the v2 shell (/v2) as a separate chunk; unset means it is not built at all. */
  readonly VITE_FF_V2_FLOW?: string;
}
