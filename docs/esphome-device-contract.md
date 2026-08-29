# ESPHome device entity contract

What a device's ESPHome firmware should expose for the server to pick it up
with zero code changes. Controllers resolve entities by **object id**, which
ESPHome derives from the entity name (`sanitize(snake_case(name))`) — so the
contract is really a naming convention: name the entity `Water Level` and the
id `water_level` follows.

Firmware that cannot conform (stock third-party devices) is described by a
_profile_: a data entry in the provider mapping its ids onto the contract's
shapes. See `PROFILES` in
[`scheduleBindings.ts`](../packages/api/src/services/devices/providers/esphome/scheduleBindings.ts).
Profiles match on the `project_name` the firmware reports (`Vendor.Product`).
Adding one must never require a new branch in a controller.

## Units

Numeric schedule sensors should declare `unit_of_measurement`. Recognized
duration units: `d`/`day`/`days`, `h`/`hr`/`hours`, `min`/`minutes`,
`s`/`seconds`. **An undeclared unit reads as days.** Timestamps are epoch
seconds (ESPHome `device_class: timestamp`).

## Water sources (fountains, bowls)

| Object id             | Type          | Required           | Meaning                                                                                                                                                           |
| --------------------- | ------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `water_level`         | sensor, %     | yes                | Fill level, 0–100. The card's gauge. Publish `NaN` (ESPHome's "unknown") rather than a made-up number when the scale has nothing to weigh; the card shows a dash. |
| `unfiltered_weight`   | sensor, g     | for drink tracking | Raw scale stream (10 Hz) during activity.                                                                                                                         |
| `activity`            | binary_sensor | for drink tracking | High while a session is in progress.                                                                                                                              |
| `last_drink_amount`   | sensor, g     | for drink tracking | Device-computed session total.                                                                                                                                    |
| `last_drink_duration` | sensor, s     | for drink tracking | Device-computed session length.                                                                                                                                   |
| `pump_fault`          | binary_sensor | no                 | On when the pump is faulted. Omit if the firmware can't detect faults.                                                                                            |
| `bowl_missing`        | binary_sensor | no                 | On when the bowl is off its scale. Shown only while on, as the reason the level reads a dash. Omit on a device whose vessel is fixed.                             |

### Maintenance schedules (water change, filter change)

A schedule can be stated in any one of three shapes, checked in this order.
Expose whichever your firmware actually knows; don't synthesize a worse shape
from a better one.

1. **Due timestamp** — `water_change_due` / `filter_change_due`
   (+ `water_change_interval` / `filter_change_interval`). Preferred: a due
   moment is a fact that survives reboots and needs no republishing.
2. **Countdown** — `water_days_remaining` / `filter_days_remaining`
   (+ the same interval ids). For firmware that only counts down.
3. **Last serviced** — `water_last_changed` + `water_reminder_interval`.
   Due is derived as last-changed plus interval. (Water only; a filter
   variant can be added to the contract when a device needs it.)

The interval sensor is optional in shapes 1–2 but strongly recommended: the
urgency band is scored as _fraction of the interval remaining_ (so a 12-hour
bowl and a 5-day fountain share one curve), and without an interval the
countdown shows with no urgency and no bar. The server falls back to the
device config's `filterIntervalDays` for the filter bar.

## Litterboxes

| Object id            | Type          | Required           | Meaning                             |
| -------------------- | ------------- | ------------------ | ----------------------------------- |
| `waste_weight`       | sensor, g     | yes                | Accumulated waste since last scoop. |
| `unfiltered_weight`  | sensor, g     | for visit tracking | Raw scale stream during activity.   |
| `activity`           | binary_sensor | for visit tracking | High while a visit is in progress.  |
| `litter_remaining`   | sensor, kg    | no                 | Litter left in the box.             |
| `litter_level`       | sensor, %     | no                 | The same litter as a share of full. |
| `full_litter_weight` | number, kg    | for the litter row | Capacity, as the owner sets it.     |
| `visits_since_clean` | sensor        | no                 | Visit count since last scoop.       |

The litter row is a composite: `litter_remaining` is the reading, because
litter is bought and refilled by weight, while `litter_level` draws the bar and
sets the urgency band, because a band in kilograms would mean something
different in every box. That share only exists against a capacity, so the row
is shown **only while `full_litter_weight` is set** — an ESPHome number nobody
has typed into publishes `0`, and a `0` here is read as unset, not as a box
that holds nothing. Firmware with a capacity but no `litter_level` still gets
both, divided server-side; the server also falls back to the device config's
`litterFullKg` when the firmware exposes no number at all.

### Maintenance schedule (deep clean / full litter change)

Same shapes as the water schedules, checked in this order:

1. **Due timestamp** — `deep_clean_due` (+ `litter_change_interval`).
2. **Countdown** — `deep_clean_timer` (+ `litter_change_interval`). Days,
   fractional, negative once overdue; NaN while no deadline has ever been
   set — publishing `0` there would claim a deadline nobody set.

Optional sensors earn card rows only while they publish **finite** values:
the server ignores NaN/unknown readings rather than rendering a lie.
Observational counters (`waste_weight`, `visits_since_clean`) are
deliberately **not** restored across a power cycle — the box may have been
moved, cleaned, or used while off, so post-boot they stay NaN until the next
reset re-anchors them. The event log on the server is the durable memory,
not the device.

## Diagnostics (any device)

Resolved by `device_class` first, conventional ids second — no contract name
required: signal strength (`device_class: signal_strength`, or
`wifi_signal`/`wifi_signal_db`) and battery (`device_class: battery`, or
`battery_level`). These render in the card's status drawer; battery also
claims a card row when unhealthy.
