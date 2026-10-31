# TESTING — 2026-11-01-004630

Commands are the project's own (root `package.json`), run from the repository root on 2026-11-01.

## Suites

```
$ npx vitest run
 ✓ packages/scheduler/test/engine.test.ts (20 tests) 50ms
 ✓ packages/shared/test/time.test.ts (14 tests) 13ms
 ✓ packages/tiktok/test/index.test.ts (16 tests) 238ms
 ✓ apps/worker/test/publish.test.ts (2 tests) 918ms      [needs Redis; skips when it is down]
 Test Files  3 passed | 1 skipped (4)
      Tests  50 passed | 2 skipped (52)
```

The worker suite self-skips when Redis is unreachable (`describe.skipIf`) instead of failing, so the
count reads 50/52 when no local Redis is running; with Redis up it is 52/52.

What each covers:

- **`packages/scheduler`** — the four modes, both spec examples (interval 2h×5/day, fixed times with
  a 3/day cap), smart distribution capacity from hours+interval, GLOBAL vs PER_ACCOUNT caps,
  active-days rollover, DST gap/overlap handling, `now` injection.
- **`packages/shared`** — wall-clock → UTC round trips (Asia/Makassar, positive/negative offsets,
  UTC date-boundary crossing), DST gap rolling forward (2026-03-08 02:30 → 03:30 EDT),
  ambiguous fall-back picking the pre-transition instant (2026-11-01 01:30 → 05:30Z), 24 h vs 23 h
  local days, `addLocalDays` across month/leap boundaries, weekday math, `HH:mm` validation.
- **`packages/tiktok`** — authorize URL, token exchange/refresh, error mapping (429 `Retry-After`,
  400/401/403 terminal vs 5xx retryable), single-chunk and 10 MiB chunked init bodies, real chunked
  upload from temp files, status parsing of TikTok's misspelled `publicaly_available_post_id`.
- **`apps/worker/test/publish.test.ts`** — real SQLite file (temp), real Redis lease, in-process fake
  TikTok API: claim → gates → init → upload → poll → `PUBLISHED`, publish id + public id persisted,
  `PublishingLog` events, `PUBLISH_SUCCESS` notification, and a second call returning `SKIPPED`
  with zero extra HTTP requests (no duplicate publish).

## Gates

| Command | Exit | Evidence |
|---|---|---|
| `npm run typecheck` | 0 | no diagnostics across web, worker and all packages |
| `npx eslint .` | 0 | `✖ 2 problems (0 errors, 2 warnings)` — `console.log` inside the logger itself |
| `npx vitest run` | 0 | Test Files 3 passed, 1 skipped (4) — 50 passed, 2 skipped (worker e2e needs Redis) |
| `npm run build` | 0 | Next.js 16.4.3 production build, 51 route entries emitted (pages + API handlers) |

## Live end-to-end run (dev server + worker, real Redis, real SQLite)

```
register 201
connect 200 mock url-ok
callback 307 http://localhost:3000/accounts?connected=1
accounts 200 mock_creator CONNECTED
upload 202 … PROCESSING
processing READY 2 320 240 /api/media/thumbnails/…
schedule 201 2026-10-31T17:17:00.000Z
publish PUBLISHED mock-publish-1793467020090
stats published=1 todayPublished=1 remainingDailySlots=4
notifications QUEUE_COMPLETED,PUBLISH_SUCCESS
```

Database after the run: video `PUBLISHED` with duration 2.0 / 320×240 and a thumbnail file on disk;
post `PUBLISHED` with `externalPublishId` + `publishedPostId`; logs `POST_INITIALIZED`,
`VIDEO_UPLOADED`, `PUBLISHED`; `data/backups/tiktok-scheduler-2026-10-31.db` (224 KB) written by the
maintenance tick.

Worker health: `{"healthy":true,"database":"ok","redis":"ok","heartbeat":"ok (9s old, …)"}`.
Web health: `{"status":"ok","database":true,"redis":true,"queuePaused":false,"tiktokMode":"mock"}`.

Browser pass (real Chrome over CDP, 1440×1000): `/login`, `/dashboard`, `/content`, `/calendar`,
`/upload`, `/queue`, `/settings`, `/accounts` all rendered with **no console errors**; dashboard and
content library screenshots confirm live values (1 video, 1 published, progress 1/5, thumbnail row
with duration/resolution/size/status/account).