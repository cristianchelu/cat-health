/** First byte of litterbox `raw_data` blobs. */
export const LITTERBOX_RAW_DATA_VERSION_1 = 1;
export const LITTERBOX_RAW_DATA_VERSION_2 = 2;

export const LITTERBOX_NULL_U16 = 65535;
export const LITTERBOX_NULL_U8 = 255;
export const LITTERBOX_NULL_I32 = -2147483648;

/** v2 timestamp-delta escape: u16 sentinel followed by the full u32 delta ms. */
export const LITTERBOX_DELTA_ESCAPE_U16 = 65535;
