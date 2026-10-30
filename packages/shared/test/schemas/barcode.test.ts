import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { isSameBarcode, parseBarcode } from '../../src/schemas/api/foods.ts';

describe('parseBarcode', () => {
  it('accepts every GTIN length a pack prints', () => {
    for (const code of [
      '96385074',
      '036000291452',
      '5901234123457',
      '15901234123454',
    ]) {
      assert.equal(parseBarcode(code), code);
    }
  });

  it('drops the spaces and hyphens printed between digit groups', () => {
    assert.equal(parseBarcode(' 5 901234 123457 '), '5901234123457');
    assert.equal(parseBarcode('0-36000-29145-2'), '036000291452');
  });

  it('refuses digit counts outside the GTIN family', () => {
    for (const code of ['', '5901234', '59012341234', '159012341234541']) {
      assert.equal(parseBarcode(code), null);
    }
  });

  it('refuses letters', () => {
    assert.equal(parseBarcode('590123412345A'), null);
  });
});

describe('isSameBarcode', () => {
  it('matches a UPC-A to its zero-led EAN-13', () => {
    assert.equal(isSameBarcode('036000291452', '0036000291452'), true);
  });

  it('keeps distinct codes apart', () => {
    assert.equal(isSameBarcode('5901234123457', '4002052003456'), false);
  });
});
