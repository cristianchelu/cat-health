import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  getNumberValue,
  getStringValue,
  isRecord,
} from "../../src/typeGuards.ts";
import {
  parseEventData,
  parseFoodIntakeEventData,
  parseLitterboxUseEliminationType,
  parseLitterboxUseEventData,
  parseWaterIntakeEventData,
  parseWeightMeasurementEventData,
} from "../../src/schemas/api/eventData.ts";
import { parseWithSchema } from "../../src/schemas/runtimeSchema.ts";
import {
  SurePetAccountConfigSchema,
  SurePetDeviceStateSchema,
} from "../../src/schemas/api/surepet.ts";

describe("typeGuards", () => {
  it("isRecord rejects primitives and arrays", () => {
    assert.equal(isRecord(null), false);
    assert.equal(isRecord([]), false);
    assert.equal(isRecord({ ok: true }), true);
  });

  it("getStringValue and getNumberValue narrow fields", () => {
    const record = { name: "x", count: 3, bad: true };
    assert.equal(getStringValue(record, "name"), "x");
    assert.equal(getStringValue(record, "count"), undefined);
    assert.equal(getNumberValue(record, "count"), 3);
  });
});

describe("parseLitterboxUseEliminationType", () => {
  it("accepts known elimination types only", () => {
    assert.equal(parseLitterboxUseEliminationType("urination"), "urination");
    assert.equal(parseLitterboxUseEliminationType("bogus"), null);
  });
});

describe("parseEventData", () => {
  it("parses weight measurement payloads", () => {
    assert.deepEqual(
      parseWeightMeasurementEventData({
        type: "weight_measurement",
        weight: 4.2,
      }),
      { type: "weight_measurement", weight: 4.2 },
    );
    assert.equal(
      parseWeightMeasurementEventData({ type: "weight_measurement" }),
      null,
    );
  });

  it("parses litterbox_use payloads with optional fields", () => {
    const parsed = parseLitterboxUseEventData({
      type: "litterbox_use",
      elimination_type: "both",
      elimination_weight: 12,
      duration: 30,
      straining: true,
      segments: null,
    });
    assert.deepEqual(parsed, {
      type: "litterbox_use",
      elimination_type: "both",
      elimination_weight: 12,
      duration: 30,
      straining: true,
      segments: null,
    });
  });

  it("returns null for unknown discriminants", () => {
    assert.equal(parseEventData({ type: "not_real" }), null);
    assert.equal(parseEventData("bad"), null);
  });

  it("preserves food provider metadata", () => {
    const providerData = {
      provider: "surepet",
      external_key: "feed-1",
      pet_id: 42,
    };
    const parsed = parseFoodIntakeEventData({
      type: "food_intake",
      food_type: "dry",
      amount: 12,
      provider_data: providerData,
    });
    assert.deepEqual(parsed?.provider_data, providerData);
  });

  it("rejects invalid optional fields", () => {
    assert.equal(
      parseWaterIntakeEventData({
        type: "water_intake",
        amount: 10,
        duration: "30",
      }),
      null,
    );
    assert.equal(
      parseLitterboxUseEventData({
        type: "litterbox_use",
        elimination_type: "urination",
        elimination_weight: 10,
        duration: 30,
        segments: [{ state: "occupied", start: "0", end: 10 }],
      }),
      null,
    );
  });
});

describe("device config parsers", () => {
  it("preserves SurePet links and synchronization state", () => {
    const parsed = parseWithSchema(SurePetAccountConfigSchema, {
      email: "cat@example.com",
      password: "secret",
      pet_links: [
        {
          external_pet_id: "remote-1",
          pet_id: 7,
          metadata: { tag_id: 123 },
        },
      ],
      sync: {
        last_timeline_since_id: 55,
        feeding_timeline_backfill_done: true,
      },
    });

    assert.deepEqual(parsed?.pet_links, [
      {
        external_pet_id: "remote-1",
        pet_id: 7,
        metadata: { tag_id: 123 },
      },
    ]);
    assert.deepEqual(parsed?.sync, {
      last_timeline_since_id: 55,
      feeding_timeline_backfill_done: true,
    });
  });

  it("preserves SurePet bowl settings", () => {
    const parsed = parseWithSchema(SurePetDeviceStateSchema, {
      provider: "surepet",
      bowl_status: [{ position: 1, current_weight: 25 }],
      bowl_settings: [{ food_type: 2, target: 40 }],
    });

    assert.deepEqual(parsed?.bowl_settings, [{ food_type: 2, target: 40 }]);
  });
});
