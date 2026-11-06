/**
 * Y-M-D key for a calendar cell. Cells are built with local Date setters (`new Date(y, m, d)`), so
 * their calendar date is the browser's local date — formatting them as UTC keys the cell one day back
 * for every timezone east of UTC (a post on the 20th rendered under the 19th).
 */
export function calendarDateKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}
