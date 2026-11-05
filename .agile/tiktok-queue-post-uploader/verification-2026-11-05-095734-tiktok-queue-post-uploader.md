# VERIFICATION — mass scheduler

| # | Acceptance criterion | Proof (executed) | Result |
|---|---|---|---|
| 1 | Select many rows on `/queue` | Chromium on `localhost:3107/queue`: checkbox column, `Select all` selects 3 rows, toolbar shows "3 selected / Mass schedule / Clear" | PASS |
| 2 | Change only the time | `POST … {"mode":"TIME","time":"19:30"}` → `{"updated":3,"staggered":1,…}`; rows `2026-11-10 19:30`, `2026-11-10 19:31`, `2026-11-11 19:30` — dates unchanged | PASS |
| 3 | Change only the date | `POST … {"mode":"DATE","date":"2026-12-01"}` → `{"updated":3,"staggered":1}`; rows `2026-12-01 19:30 / 19:31 / 19:32` — times unchanged | PASS |
| 4 | Immutable rows skipped, not moved | PUBLISHED row returned `POST_IMMUTABLE` and stayed at `2026-11-09T05:00Z` | PASS |
| 5 | Per-post timezone honoured | Browser Asia/Makassar (+8) vs post Asia/Jakarta (+7): dialog prefilled `09:00` / `2026-11-10` (post wall clock); saving unchanged displayed `10:00 AM` in browser TZ = 09:00 Jakarta | PASS |
| 6 | Same-minute collisions spaced, reported | 2 posts on one account/day → toast "2 post(s) rescheduled, 1 spaced 1 minute apart"; DB rows one minute apart | PASS |
| 7 | Queue re-armed | Post statuses went `PENDING`/`FAILED` → `QUEUED` after each run (Redis up), `SCHEDULE_CHANGED` log + one notification per call | PASS |
| 8 | No regressions | `npm run typecheck` clean; `npm test` 70 passed / 2 skipped (worker tests need Redis); eslint on all changed files clean; existing retry/cancel/reschedule/caption flows untouched in the browser run | PASS |
| 9 | Independent review | `reviewer` verdict PASS after fixing prefill-timezone and stale-selection findings | PASS |

Remaining operational step: the instance on `192.168.1.11:3100` runs the old build — restart or
redeploy it to pick up this change.
