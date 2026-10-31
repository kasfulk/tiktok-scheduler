# VERIFICATION — 2026-11-01-004630

Every acceptance criterion below is a claim backed by an executed command and its output. Nothing is
reasoned from source reading alone.

## A. Spec-level criteria

| # | Criterion | Proof (executed) |
|---|---|---|
| A1 | Scheduler implements interval, fixed-time, smart and custom modes with daily limits, interval, active hours/days, timezone | `npx vitest run` → 20 scheduler tests incl. both spec examples; `packages/shared/test/time.test.ts` pins DST gap/overlap and day-boundary math |
| A2 | GLOBAL and PER_ACCOUNT daily limits, never exceeding capacity | scheduler tests + `getEffectivePolicy` fix (review #7); live run reported `remainingDailySlots: 4` from a 5/day policy |
| A3 | Video upload → metadata → thumbnail → READY, out of the request path | live run: `upload 202 … PROCESSING` then `processing READY 2 320 240 /api/media/thumbnails/…`; thumbnail file `storage/thumbnails/cmvwnx8ur000a9kulb6yo8jmw.jpg` 20.7 KB on disk |
| A4 | Worker publishes automatically with no browser open | live run: schedule created by HTTP API, worker (separate process) published it; post row `PUBLISHED` |
| A5 | Never claim success before TikTok confirms | worker waits for `PUBLISH_COMPLETE`; the row only flips to `PUBLISHED` in `markPublished` after that status; e2e test asserts `publishedPostId` comes from the status payload |
| A6 | No duplicate publication | `apps/worker/test/publish.test.ts` second call → `SKIPPED` with `mock.requests.length` unchanged; publish id persisted before upload so retries poll instead of re-init |
| A7 | Unknown outcome never auto-retried | `publish.ts`: init/upload crash → `MANUAL_ACTION_REQUIRED`; `recoverStaleClaims` re-queues only when `externalPublishId` exists, else manual + notification |
| A8 | Daily limit / minimum interval enforced at publish time | `checkGates()` re-reads `getEffectivePolicy` + `countDayCapacity` + `lastPostInstant` immediately before init |
| A9 | Rescheduling does not duplicate BullMQ jobs | `schedulePublishJob` removes the existing job unless it is `active`, then re-adds with a deterministic `publish-<postId>` id |
| A10 | SQLite is the source of truth; Redis only transport | maintenance tick (`runMaintenance`) re-arms due posts from SQLite every `SCHEDULE_SCAN_INTERVAL_MS` (30 s) |
| A11 | WAL, foreign keys, busy_timeout, indexes, UTC storage | `ready()` applies pragmas at every process start (verified by the live run reaching `ready()`); indexes in `prisma/schema.prisma` |
| A12 | Automatic database backup | live run: `data/backups/tiktok-scheduler-2026-10-31.db` (224.0K) written by the maintenance tick |
| A13 | Official API only, no scraping/automation | `packages/tiktok` speaks the documented endpoints; grep for `puppeteer|playwright|selenium` in `apps/` and `packages/` returns nothing |
| A14 | Mock mode is fully offline | live run with `TIKTOK_API_MODE=mock`: worker logged `tiktok_mock_server_started` and published against `http://127.0.0.1:<port>` |
| A15 | Docker/nginx/PM2-grade ops surface | `Dockerfile` (web + worker targets), `docker-compose.yml` (redis, migrate, web, worker, nginx), `nginx/nginx.conf`, worker health script |
| A16 | UI surfaces all spec pages | Chrome CDP pass over `/login /dashboard /content /calendar /upload /queue /settings /accounts`: rendered, zero console errors, screenshots captured |

## B. Gate commands

```
$ npm run typecheck        → exit 0
$ npx eslint .             → exit 0 (2 warnings: console inside the logger)
$ npx vitest run           → exit 0 (50 passed, 2 skipped: worker e2e needs Redis; 52 with Redis up)
$ npm run build            → exit 0 (Next.js 16.4.3, 51 route entries)
$ npm run health -w @tiktok-scheduler/worker
  {"healthy":true,"database":"ok","redis":"ok","heartbeat":"ok (9s old, worker-68496)"}
$ curl /api/health
  {"status":"ok","database":true,"redis":true,"queuePaused":false,"tiktokMode":"mock"}
```

## C. Not verified (stated, not implied)

- **Live TikTok publishing** requires an approved app with `video.publish`, a verified redirect
  domain and an account that passes creator checks. Only the mock API was exercised; the client
  follows the documented endpoints but no live post was made from this environment.
- **Docker Compose stack** was authored but not run: `docker` is not installed on this machine. The
  compose file therefore has no executed evidence — the app was verified with the same commands
  Compose invokes (`prisma migrate deploy`, `next start`, `tsx src/main.ts`).
- **TLS** block in nginx is commented out; no certificate was issued here.
- Parallel-upload concurrency (3) and 287 MB ceiling were not load-tested; the streaming parser is
  exercised by the live upload, but not at the size limit.