# BRAINSTORM — mass scheduler for the publishing queue

## Problem
Rescheduling 30 queued posts one dialog at a time is the only option today. The user wants a
bulk edit that changes **only the time** (keep each post's own date) or **only the date**
(keep each post's own time).

## Requirements
1. On `/queue`, select multiple rows (checkbox per row + header select-all).
2. One action opens a dialog with two modes: `TIME` (HH:MM input) and `DATE` (YYYY-MM-DD input).
3. `TIME`: every selected post keeps its own local date, adopts the chosen local time.
4. `DATE`: every selected post keeps its own local time, adopts the chosen local date.
5. Per-post timezone is honoured (`ScheduledPost.timezone`, falling back to the user timezone).
6. Terminal rows (PUBLISHING, PUBLISHED, MANUAL_ACTION_REQUIRED, CANCELLED) are skipped with a
   reason, never silently moved.
7. Queue jobs are re-armed; publishing logs and one notification record the change.
8. Posts of the same account landing on the same instant are spaced 1 minute apart and the
   response reports how many were staggered.

## Constraints
- Reuse `formatLocalDate` / `formatLocalTime` / `localDateTimeToUtc` and `armPublishJob`.
- No new dependency; no schema migration (scheduledAt already holds the instant).
- Keep the single-post reschedule endpoint untouched.

## Acceptance criteria
- Selecting 3 posts and choosing 19:30 changes only their times, dates intact.
- Selecting 3 posts and choosing 2026-12-01 changes only their dates, times intact.
- Immutable rows are rejected per id; the response lists them.
- `npm run typecheck` and `npm test` pass; the dialog works in the running app.
