import { isSameBarcode, parseBarcode, type GetFoodDTO } from 'shared';

/**
 * The slice of `BarcodeDetector` this app uses. Named as an interface so the
 * scanner can be driven by a stub in tests, where no such API exists.
 */
export interface PackBarcodeDetector {
  detect(
    source: CanvasImageSource,
  ): Promise<ReadonlyArray<{ rawValue: string }>>;
}

interface BarcodeDetectorConstructor {
  new (options?: { formats: string[] }): PackBarcodeDetector;
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

/** The retail symbologies whose digits `parseBarcode` accepts. */
const PACK_FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'];

export function createPackBarcodeDetector(): PackBarcodeDetector {
  const Detector = detectorConstructor();
  if (!Detector) throw new Error('BarcodeDetector is unavailable');
  return new Detector({ formats: PACK_FORMATS });
}

/** The food carrying this barcode, or null when none does or it is not one. */
export function matchFoodByBarcode(
  foods: readonly GetFoodDTO[],
  rawValue: string,
): GetFoodDTO | null {
  const code = parseBarcode(rawValue);
  if (code === null) return null;
  return (
    foods.find(
      (food) => food.barcode !== null && isSameBarcode(food.barcode, code),
    ) ?? null
  );
}
