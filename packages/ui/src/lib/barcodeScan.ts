import type { GetFoodDTO } from 'shared';

/**
 * The slice of `BarcodeDetector` this app uses. Named as an interface so the
 * scanner can be driven by a stub in tests, where no such API exists.
 */
export interface Ean13Detector {
  detect(
    source: CanvasImageSource,
  ): Promise<ReadonlyArray<{ rawValue: string }>>;
}

interface BarcodeDetectorConstructor {
  new (options?: { formats: string[] }): Ean13Detector;
}

function detectorConstructor(): BarcodeDetectorConstructor | null {
  const candidate = (
    globalThis as unknown as {
      BarcodeDetector?: BarcodeDetectorConstructor;
    }
  ).BarcodeDetector;
  return candidate ?? null;
}

/**
 * Whether this browser can scan at all. Where it cannot, the scan action is
 * simply absent and the ladder is the whole story — the same call the design
 * makes for a desktop with no camera.
 */
export function isBarcodeScanSupported(): boolean {
  return (
    detectorConstructor() !== null &&
    typeof navigator !== 'undefined' &&
    typeof navigator.mediaDevices?.getUserMedia === 'function'
  );
}

export function createEan13Detector(): Ean13Detector {
  const Detector = detectorConstructor();
  if (!Detector) throw new Error('BarcodeDetector is unavailable');
  return new Detector({ formats: ['ean_13'] });
}

const EAN13 = /^[0-9]{13}$/;

/**
 * The food carrying this barcode, or null. Anything that is not a 13-digit
 * code is not something this library stores, so it never matches.
 */
export function matchFoodByBarcode(
  foods: readonly GetFoodDTO[],
  rawValue: string,
): GetFoodDTO | null {
  const code = rawValue.trim();
  if (!EAN13.test(code)) return null;
  return foods.find((food) => food.barcode_ean13 === code) ?? null;
}
