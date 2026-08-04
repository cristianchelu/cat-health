/**
 * Turning a radio reading into bars.
 *
 * dBm is a physical unit and means the same received power on every radio, but
 * the ladder from dBm to bars does not carry across: WiFi is usable to about
 * -90, BLE and 802.15.4 to about -100, LoRa past -120. One set of cutoffs
 * would draw the same four bars against sensitivity floors 30 dB apart, and
 * read as a confident claim about link quality that nothing supports.
 *
 * So the scale belongs to whoever knows which radio produced the number, and
 * that is the controller — never this module, and never the signal builder.
 * The one ladder kept here is the 802.11 convention, because it is a published
 * standard rather than one vendor's choice and any WiFi provider wants it. A
 * vendor's own ladder lives with that vendor's provider.
 */

/**
 * Bar cutoffs in dBm, strongest first, one entry per bar: a reading at or
 * above `ladder[i]` draws `ladder.length - i` bars.
 *
 * The weakest entry may be `-Infinity`, for a vendor whose scale bottoms out
 * at one bar rather than at none. That is a real distinction rather than a
 * rounding choice — it says a device still reporting has, by definition, a
 * link worth drawing, and that being unreachable is a different signal's job.
 */
export type RssiLadder = readonly number[];

/**
 * The conventional WiFi ladder, where -67 dBm is the usual line for traffic
 * that cannot tolerate retries. Not a claim about link quality; it is what
 * every other 802.11 client draws, which is the point of matching it.
 */
export const WIFI_RSSI_LADDER: RssiLadder = [-55, -67, -75, -85];

/** Bars lit for a reading, on the scale the caller says it was measured on. */
export function rssiBars(dbm: number, ladder: RssiLadder): number {
  /*
   * A missing or malformed reading is not a weak signal, so it draws nothing
   * even on a ladder that otherwise floors at one bar. Guarding here rather
   * than relying on the comparisons also keeps NaN from silently landing on
   * the bottom rung, where it would read as a device that is barely hanging on.
   */
  if (!Number.isFinite(dbm)) {
    return 0;
  }

  const index = ladder.findIndex((cutoff) => dbm >= cutoff);
  return index === -1 ? 0 : ladder.length - index;
}
