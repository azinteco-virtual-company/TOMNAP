/** Build-time feature flags: Vite inlines VITE_* values; unset means disabled. */
/** Manifest AWB review screen (fix of the existing manifest feature). */
export const AWB_REVIEW_ENABLED = import.meta.env.VITE_FF_AWB_REVIEW === 'true';
/** v2 akışının istemci kabuğu (/v2); kapalıyken kabuk derlemeye hiç girmez. */
export const V2_FLOW_ENABLED = import.meta.env.VITE_FF_V2_FLOW === 'true';
