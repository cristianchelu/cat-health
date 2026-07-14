import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { GetSettingsResponseDTO } from 'shared';
import {
  clearRegionalFormatCaches,
  formatDate,
  formatDateNumeric,
  formatDateTime,
  formatNumber,
  formatTime,
  getRegionalFormatCacheSizesForTests,
} from '../regionalFormat.ts';
import { resolveRegionalPreferences } from 'shared';

function baseSettings(
  overrides: Partial<GetSettingsResponseDTO> = {},
): GetSettingsResponseDTO {
  return {
    tracking_gap_threshold_minutes: 360,
    language: 'en',
    timezone: 'UTC',
    time_format: 'h24',
    date_format: 'DMY',
    first_weekday: 'monday',
    number_format: 'comma_decimal',
    ...overrides,
  };
}

function prefsFor(overrides: Partial<GetSettingsResponseDTO> = {}) {
  return resolveRegionalPreferences(baseSettings(overrides), 'UTC');
}

describe('regionalFormat', () => {
  it('formats time in 24-hour mode', () => {
    clearRegionalFormatCaches();
    const formatted = formatTime(new Date('2024-06-15T14:30:00Z'), prefsFor());
    assert.match(formatted, /14:30/);
  });

  it('reorders numeric dates for DMY, MDY, and YMD', () => {
    clearRegionalFormatCaches();
    const date = new Date('2024-06-15T12:00:00Z');

    assert.match(formatDateNumeric(date, prefsFor()), /^15\/06\/2024$/);
    assert.match(
      formatDateNumeric(date, prefsFor({ date_format: 'MDY' })),
      /^06\/15\/2024$/,
    );
    assert.match(
      formatDateNumeric(date, prefsFor({ date_format: 'YMD' })),
      /^2024-06-15$/,
    );
  });

  it('applies explicit date format to formatDate and formatDateTime', () => {
    clearRegionalFormatCaches();
    const date = new Date('2024-06-15T12:00:00Z');
    const prefs = prefsFor();
    assert.match(formatDate(date, prefs, 'short'), /^15\/06\/2024$/);
    assert.match(formatDateTime(date, prefs), /^15\/06\/2024 /);
  });

  it('formats numbers with comma decimals and decimal commas', () => {
    clearRegionalFormatCaches();
    assert.equal(formatNumber(1234.5, prefsFor()), '1,234.5');
    assert.equal(
      formatNumber(1234.5, prefsFor({ number_format: 'decimal_comma' })),
      '1.234,5',
    );
  });

  it('reuses memoized date-time formatters for the same prefs', () => {
    clearRegionalFormatCaches();
    const prefs = prefsFor();
    formatTime(new Date('2024-06-15T14:30:00Z'), prefs);
    formatTime(new Date('2024-06-15T15:30:00Z'), prefs);
    assert.equal(getRegionalFormatCacheSizesForTests().dateTime, 1);
  });

  it('returns empty strings for invalid dates', () => {
    clearRegionalFormatCaches();
    const invalid = new Date('invalid');
    const prefs = prefsFor();
    assert.equal(formatTime(invalid, prefs), '');
    assert.equal(formatDate(invalid, prefs), '');
    assert.equal(formatDateTime(invalid, prefs), '');
  });
});
