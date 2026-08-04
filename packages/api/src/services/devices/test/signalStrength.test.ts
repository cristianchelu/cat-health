import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  rssiBars,
  WIFI_RSSI_LADDER,
  type RssiLadder,
} from '../signalStrength.ts';
import { SUREPET_RSSI_LADDER } from '../providers/surepet/constants.ts';

/**
 * The ladders are vendor facts, so these tests read as tables of readings and
 * the bars they must draw. A cutoff moving is a decision someone has to make
 * deliberately, not something a refactor gets to do quietly.
 */

const barsAt = (ladder: RssiLadder, dbm: number) => rssiBars(dbm, ladder);

describe('rssiBars', () => {
  describe('the WiFi ladder', () => {
    it('draws the conventional 802.11 bars', () => {
      const cases: ReadonlyArray<[number, number]> = [
        [-20, 4],
        [-55, 4],
        [-56, 3],
        [-67, 3],
        [-68, 2],
        [-75, 2],
        [-76, 1],
        [-85, 1],
        [-86, 0],
        [-120, 0],
      ];

      for (const [dbm, bars] of cases) {
        assert.equal(barsAt(WIFI_RSSI_LADDER, dbm), bars, `${dbm} dBm`);
      }
    });

    it('keeps a zero state, because WiFi has one', () => {
      assert.equal(barsAt(WIFI_RSSI_LADDER, -90), 0);
    });
  });

  describe('the SurePetcare ladder', () => {
    it('draws what their web app draws', () => {
      const cases: ReadonlyArray<[number, number]> = [
        [-20, 4],
        [-36, 4],
        [-37, 3],
        [-59, 3],
        [-61, 2],
        [-74, 2],
        [-76, 1],
        [-81, 1],
        [-120, 1],
      ];

      for (const [dbm, bars] of cases) {
        assert.equal(barsAt(SUREPET_RSSI_LADDER, dbm), bars, `${dbm} dBm`);
      }
    });

    it('bins the two readings their own bounds drop', () => {
      // Their bins are exclusive at both ends, so -60 and -75 miss every
      // branch and hit the one-bar default. We bin them with their neighbours.
      assert.equal(barsAt(SUREPET_RSSI_LADDER, -60), 3);
      assert.equal(barsAt(SUREPET_RSSI_LADDER, -75), 2);
    });

    it('never falls to no bars, because their scale has no zero state', () => {
      for (const dbm of [-81, -82, -100, -200]) {
        assert.equal(barsAt(SUREPET_RSSI_LADDER, dbm), 1, `${dbm} dBm`);
      }
    });

    it('reads a healthy feeder lower than the WiFi ladder would', () => {
      // The 19 dB gap at the top is the whole reason this ladder exists: a
      // feeder a room from the hub must agree with what the vendor shows.
      assert.equal(barsAt(WIFI_RSSI_LADDER, -50), 4);
      assert.equal(barsAt(SUREPET_RSSI_LADDER, -50), 3);
    });
  });

  describe('a reading that is not a reading', () => {
    it('draws nothing, on any ladder', () => {
      // Absent is not weak. A floored ladder still reports no bars rather than
      // its bottom rung, which would read as a device barely hanging on.
      for (const ladder of [WIFI_RSSI_LADDER, SUREPET_RSSI_LADDER]) {
        assert.equal(rssiBars(Number.NaN, ladder), 0);
        assert.equal(rssiBars(Number.POSITIVE_INFINITY, ladder), 0);
        assert.equal(rssiBars(Number.NEGATIVE_INFINITY, ladder), 0);
      }
    });
  });
});
