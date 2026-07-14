import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  resolveRegionalPreferences,
  resolveUse12HourClock,
  resolveWeekStartsOn,
} from "../../src/regional/preferences.ts";
import { createDefaultSettingsResponse } from "../../src/schemas/api/settings.ts";

describe("resolveRegionalPreferences", () => {
  it("defaults language to en and resolves system timezone", () => {
    const prefs = resolveRegionalPreferences(
      createDefaultSettingsResponse(),
      "Europe/Bucharest",
    );
    assert.equal(prefs.language, "en");
    assert.equal(prefs.intlLanguageTag, "en-US");
    assert.equal(prefs.timezone, "Europe/Bucharest");
    assert.equal(prefs.timeFormat, "language");
  });

  it("honors explicit h24 time format", () => {
    const prefs = resolveRegionalPreferences(
      {
        ...createDefaultSettingsResponse(),
        time_format: "h24",
      },
      "UTC",
    );
    assert.equal(prefs.use12HourClock, false);
  });

  it("maps Romanian language to ro-RO", () => {
    const prefs = resolveRegionalPreferences(
      {
        ...createDefaultSettingsResponse(),
        language: "ro",
      },
      "UTC",
    );
    assert.equal(prefs.intlLanguageTag, "ro-RO");
  });

  it("honors explicit stored timezone", () => {
    const prefs = resolveRegionalPreferences(
      {
        ...createDefaultSettingsResponse(),
        timezone: "America/New_York",
      },
      "Europe/Bucharest",
    );
    assert.equal(prefs.timezone, "America/New_York");
  });
});

describe("resolveUse12HourClock", () => {
  it("returns true for explicit h12", () => {
    assert.equal(resolveUse12HourClock("h12", "en-US"), true);
  });

  it("returns false for explicit h24", () => {
    assert.equal(resolveUse12HourClock("h24", "en-US"), false);
  });

  it("probes en-US as 12-hour for language mode", () => {
    assert.equal(resolveUse12HourClock("language", "en-US"), true);
  });

  it("probes ro-RO as 24-hour for language mode", () => {
    assert.equal(resolveUse12HourClock("language", "ro-RO"), false);
  });
});

describe("resolveWeekStartsOn", () => {
  it("returns monday when configured explicitly", () => {
    assert.equal(resolveWeekStartsOn("monday", "en", "en-US"), 1);
  });

  it("returns sunday when configured explicitly", () => {
    assert.equal(resolveWeekStartsOn("sunday", "ro", "ro-RO"), 0);
  });

  it("falls back to language defaults for language mode", () => {
    assert.equal(resolveWeekStartsOn("language", "en", "en-US"), 0);
    assert.equal(resolveWeekStartsOn("language", "ro", "ro-RO"), 1);
  });
});
