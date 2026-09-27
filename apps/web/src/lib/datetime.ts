/**
 * Bridging between stored ISO-8601 UTC instants and the values `<input>`
 * elements expect, which are always local-time and have no timezone suffix.
 *
 * This is the one genuinely web-specific piece of date handling, which is why
 * it lives here rather than in @date-calendar/core — React Native uses a native
 * picker that works with `Date` objects directly.
 */

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** ISO instant -> `YYYY-MM-DDTHH:mm` in local time, for `datetime-local`. */
export function toDateTimeInput(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

/** ISO instant -> `YYYY-MM-DD` in local time, for `<input type="date">`. */
export function toDateInput(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Local `YYYY-MM-DDTHH:mm` -> ISO instant. */
export function fromDateTimeInput(value: string): string {
  return new Date(value).toISOString();
}

/**
 * Local `YYYY-MM-DD` -> ISO instant at the given local time of day.
 * Used when toggling all-day on and off, where only the date survives.
 */
export function fromDateInput(value: string, hour: number, minute: number): string {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year!, month! - 1, day!, hour, minute, 0, 0).toISOString();
}

/** Round a Date up to the next `step`-minute boundary, for sensible defaults. */
export function roundToNextSlot(date: Date, step = 30): Date {
  const rounded = new Date(date);
  rounded.setSeconds(0, 0);
  const remainder = rounded.getMinutes() % step;
  rounded.setMinutes(rounded.getMinutes() + (remainder === 0 ? 0 : step - remainder));
  return rounded;
}
