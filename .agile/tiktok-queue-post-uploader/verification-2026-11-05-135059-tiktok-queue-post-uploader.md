# VERIFICATION — generate schedule follows the requested hours

Session: 2026-11-05-135059-tiktok-queue-post-uploader (scope `tiktok-queue-post-uploader`)

| # | Acceptance criterion | Proof (executed) | Result |
|---|---|---|---|
| 1 | INTERVAL generation starts at the requested start time | Live `POST /api/schedules/generate` with `schedulingMode: INTERVAL`, `startTime: 14:30`, `intervalMinutes: 90`, active hours 09:00–22:00 → `201`; posts at `2026-11-06 14:30`, `16:30`, `18:30` (Asia/Jakarta) | PASS |
| 2 | The dialog sends that hour | `buildGenerateScheduleBody` sends `startTime` + `intervalMinutes` for INTERVAL and SMART (unit test); Chromium run of `/calendar` → Generate: mode Interval shows `Start time` and `Interval (minutes)`, submitting with `19:30` created a post at `2026-11-07T12:30:00.000Z` = 19:30 Asia/Jakarta | PASS |
| 3 | SMART mode is accepted instead of 422 | SMART body now carries `intervalMinutes`, which `generateScheduleSchema.superRefine` requires | PASS |
| 4 | FIXED_TIME keeps using posting times, and they are configurable | The ignored `Start time` field was removed from FIXED_TIME; an add-time control appends custom times; the engine run confirms `19:30/20:15` are honoured | PASS |
| 5 | Times outside the active hours are rejected before submitting | `buildGenerateScheduleBody` returns `Start time must be inside the active hours` / `Posting times must be inside the active hours`; covered by 2 unit assertions | PASS |
| 6 | Start date defaults to the user's local day | `formatLocalDate(new Date(), timezone)` (was `toISOString().slice(0,10)`, i.e. UTC); the dialog rendered `2026-11-05` for a user in Asia/Jakarta at 12:56 local | PASS |
| 7 | No regressions | `npm run typecheck` exit 0, eslint clean, `npx vitest run` 76 passed / 2 skipped; the single failing file (`apps/worker/test/publish.test.ts`) fails identically with this change stashed | PASS |

Cleanup: seeded verification user `verify-schedule@example.com` deleted (cascade; 3 users remain),
temp scripts, cookie jar and `.playwright-cli` removed, Next-generated `apps/web/AGENTS.md` deleted.

Remaining operational step: the instance on `192.168.1.11:3100` still serves the previous build.
