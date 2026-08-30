/**
 * Vision-capable and cheap; the recognizer sends a handful of 256px thumbnails
 * per call. Successor to the `google/gemma-3-27b-it` this project has been
 * running.
 *
 * The app's default, not a stored value: a recognition config holding
 * `model: null` resolves to whatever this constant says at the time of the
 * call, so upgrading the default reaches every device that never picked one.
 */
export const DEFAULT_RECOGNIZER_MODEL = 'google/gemma-4-31b-it';
