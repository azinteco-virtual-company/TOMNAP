/** Build-time feature flags: Vite inlines VITE_* values; unset means disabled. */
export const V2_FLOW_ENABLED = import.meta.env.VITE_FF_V2_FLOW === 'true';
