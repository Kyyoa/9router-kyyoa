/**
 * Traffic bucketing for the Overview activity heatmap (#15).
 *
 * Lives apart from the JSX atoms on purpose: this is the only piece with real
 * logic, and keeping it framework-free makes it directly unit-testable - the
 * repo runs vitest without a JSX transform.
 *
 * Buckets are the *browser's* local weekday × hour, not UTC: the traffic
 * pattern that matters to the owner is their own working day, and the gateway
 * runs in UTC. A UTC regression here would silently shift every cell.
 */

const DAYS_PER_WEEK = 7;
const HOURS_PER_DAY = 24;

/** Index of the first day of a Monday-first week: getDay() 0=Sun → 0=Mon. */
function mondayFirstIndex(day) {
  return (day + DAYS_PER_WEEK - 1) % DAYS_PER_WEEK;
}

/**
 * Bucket request timestamps into a 7×24 grid.
 *
 * Unparsable entries are skipped rather than throwing - one bad row must not
 * cost the user the whole heatmap. Returns { grid, max, total } with grid in
 * Monday-first row order and local hour columns.
 */
export function bucketTimestampsByDowHour(timestamps = []) {
  const grid = Array.from({ length: DAYS_PER_WEEK }, () => new Array(HOURS_PER_DAY).fill(0));
  let total = 0;

  for (const ts of timestamps) {
    // Guard nullish first: new Date(null) is the epoch, not NaN, so a missing
    // timestamp would otherwise be counted as traffic on Mon 00:00.
    if (ts === null || ts === undefined || ts === "") continue;
    const d = ts instanceof Date ? ts : new Date(ts);
    if (Number.isNaN(d.getTime())) continue;
    grid[mondayFirstIndex(d.getDay())][d.getHours()] += 1;
    total += 1;
  }

  let max = 0;
  for (const row of grid) {
    for (const v of row) if (v > max) max = v;
  }

  return { grid, max, total };
}
