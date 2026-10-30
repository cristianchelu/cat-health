import assert from 'node:assert/strict';
import { afterEach, describe, it } from 'node:test';
import type { GetFoodDTO } from 'shared';

import { isBarcodeScanSupported, matchFoodByBarcode } from '../barcodeScan.ts';

function food(id: number, barcode: string | null): GetFoodDTO {
  return {
    id,
    name: `Food ${id}`,
    brand: null,
    food_type: 'complete_wet',
    barcode: barcode,
    moisture_percent: null,
    calories_per_100g: null,
    nutrients: null,
    serving_size_g: null,
    notes: null,
    created_at: 0,
    updated_at: 0,
  };
}

const FOODS = [
  food(1, '4002052003456'),
  food(2, null),
  food(3, '9007675020304'),
];

describe('matchFoodByBarcode', () => {
  it('finds the food carrying that code', () => {
    assert.equal(matchFoodByBarcode(FOODS, '9007675020304')?.id, 3);
  });

  it('tolerates the whitespace a scan can carry', () => {
    assert.equal(matchFoodByBarcode(FOODS, ' 4002052003456 ')?.id, 1);
  });

  it('matches nothing for a code the library does not hold', () => {
    assert.equal(matchFoodByBarcode(FOODS, '1111111111116'), null);
  });

  it('finds a UPC-A food from the EAN-13 a scanner reads for it', () => {
    assert.equal(
      matchFoodByBarcode([food(4, '036000291452')], '0036000291452')?.id,
      4,
    );
  });

  it('finds a food by its EAN-8', () => {
    assert.equal(matchFoodByBarcode([food(5, '96385074')], '96385074')?.id, 5);
  });

  it('refuses anything that is not a barcode', () => {
    for (const code of ['', '40020520034', 'abcdefghijklm']) {
      assert.equal(matchFoodByBarcode(FOODS, code), null);
    }
  });

  it('never matches a food with no barcode recorded', () => {
    assert.equal(matchFoodByBarcode([food(2, null)], '4002052003456'), null);
  });
});

describe('isBarcodeScanSupported', () => {
  const globals = globalThis as unknown as {
    BarcodeDetector?: unknown;
    navigator: { mediaDevices?: unknown };
  };
  const originalDetector = globals.BarcodeDetector;
  const originalMedia = globals.navigator?.mediaDevices;

  afterEach(() => {
    if (originalDetector === undefined) delete globals.BarcodeDetector;
    else globals.BarcodeDetector = originalDetector;
    Object.defineProperty(globals.navigator, 'mediaDevices', {
      value: originalMedia,
      configurable: true,
    });
  });

  function setUp(detector: unknown, media: unknown) {
    if (detector === undefined) delete globals.BarcodeDetector;
    else globals.BarcodeDetector = detector;
    Object.defineProperty(globals.navigator, 'mediaDevices', {
      value: media,
      configurable: true,
    });
  }

  it('is supported only when both the detector and a camera exist', () => {
    setUp(class {}, { getUserMedia: () => {} });
    assert.equal(isBarcodeScanSupported(), true);
  });

  it('is unsupported without a detector — Safari and Firefox today', () => {
    setUp(undefined, { getUserMedia: () => {} });
    assert.equal(isBarcodeScanSupported(), false);
  });

  it('is unsupported without camera access — a plain desktop', () => {
    setUp(class {}, undefined);
    assert.equal(isBarcodeScanSupported(), false);
  });
});
