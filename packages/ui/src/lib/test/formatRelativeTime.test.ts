import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { enUS, ro } from 'date-fns/locale';

import {
  coerceEpochDate,
  formatRelativeTimeAgo,
  isMeaningfulLastSeen,
  resolveDateFnsLocale,
} from '../formatRelativeTime.ts';

describe('resolveDateFnsLocale', () => {
  it('maps language tags to date-fns locales', () => {
    assert.equal(resolveDateFnsLocale('ro-RO'), ro);
    assert.equal(resolveDateFnsLocale('en-US'), enUS);
    assert.equal(resolveDateFnsLocale(undefined), enUS);
  });
});

describe('coerceEpochDate', () => {
  it('treats sub-1e12 numeric values as seconds since epoch', () => {
    const date = coerceEpochDate(1_700_000_000);
    assert.ok(date);
    assert.equal(date?.getTime(), 1_700_000_000_000);
  });

  it('accepts millisecond epochs and ISO strings', () => {
    const ms = Date.UTC(2026, 0, 15, 12, 0, 0);
    assert.equal(coerceEpochDate(ms)?.getTime(), ms);
    assert.equal(
      coerceEpochDate('2026-01-15T12:00:00.000Z')?.toISOString(),
      '2026-01-15T12:00:00.000Z',
    );
  });

  it('returns null for invalid inputs', () => {
    assert.equal(coerceEpochDate(null), null);
    assert.equal(coerceEpochDate('not-a-date'), null);
  });
});

describe('isMeaningfulLastSeen', () => {
  it('rejects epoch-garbage and accepts recent timestamps', () => {
    assert.equal(
      isMeaningfulLastSeen(new Date('1970-01-21T15:34:13.443Z')),
      false,
    );
    assert.equal(
      isMeaningfulLastSeen(new Date('2026-07-14T12:00:00.000Z')),
      true,
    );
    assert.equal(isMeaningfulLastSeen(null), false);
  });
});

describe('formatRelativeTimeAgo', () => {
  it('formats a recent timestamp with an ago suffix', () => {
    const twoHoursEarlier = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const label = formatRelativeTimeAgo(twoHoursEarlier, {
      locale: enUS,
      addSuffix: true,
    });

    assert.match(label ?? '', /2 hours ago/);
  });
});
