# IMPLEMENTATION_PLAN — TikTok Scheduler

Living document. Updated at the end of every phase (rule: "Update IMPLEMENTATION_PLAN.md setelah
setiap phase"). Architecture and diagrams live in `SYSTEM_DESIGN.md`.

Legend: `[x]` done and verified · `[~]` done with a documented gap · `[ ]` not started · `[-]` out of
scope (documented reason).

Status 2026-11-01: shipped and verified — `npm run typecheck`, `npm run lint`, `npm test` (38 tests),
`npm run build`, plus a live end-to-end run: register → mock OAuth connect → upload (ffprobe/thumbnail
by the worker) → generate schedule → worker published it through the mock TikTok API
(`POST_INITIALIZED → VIDEO_UPLOADED → PUBLISHED`, notification + daily-limit accounting), with a
`VACUUM INTO` backup written by the maintenance tick. Remaining gaps are the `[~]` rows below.

---

## Phase 1 — Foundation

| # | Task | Files | Status |
|---|---|---|---|
| 1.1 | npm workspace monorepo (`apps/*`, `packages/*`), strict TS, base configs | `package.json`, `tsconfig.*.json` | [x] |
| 1.2 | Prisma schema (11 models), SQLite WAL/pragma bootstrap, migrations | `prisma/`, `packages/db/src/client.ts` | [x] |
| 1.3 | Shared contracts: enums, Zod schemas, timezone math | `packages/shared/src/` | [x] |
| 1.4 | Auth: scrypt hashing, DB-backed sessions, cookie handling, guards | `packages/db/src/{password,encryption,auth}.ts` | [x] |
| 1.5 | REST API: auth, videos, schedules, queue, tiktok, publishing, settings | `apps/web/app/api/**` | [x] |
| 1.6 | App shell: sidebar, theme switch, TanStack Query provider, toasts | `apps/web/app/(dashboard)/layout.tsx` | [x] |
| 1.7 | Dashboard: stats, daily progress, upcoming posts, activity chart | `apps/web/app/(dashboard)/dashboard/` | [x] |
| 1.8 | Docker Compose (`web`, `worker`, `redis`, `nginx`, `migrate`), healthchecks, nginx TLS | `docker-compose.yml`, `Dockerfile`, `nginx/nginx.conf` | [x] |
| 1.9 | Redis + BullMQ wiring, queue pause/resume API | `apps/worker/src/queue.ts` | [x] |

Exit gate: `npm run typecheck`, `npm run test`, `npm run build` green; login → dashboard works
against a real SQLite file; `/api/health` reports DB + Redis.

---

## Phase 2 — Video management

| # | Task | Status |
|---|---|---|
| 2.1 | Multipart upload endpoint: streaming to temp file, MIME sniff, size limit, concurrency cap | [x] |
| 2.2 | `PROCESS_VIDEO` worker job: ffprobe metadata, ffmpeg thumbnail, status transitions | [x] |
| 2.3 | Content Library page: table, search, status filter, sort, bulk select/delete/caption | [x] |
| 2.4 | Upload page: drag & drop, per-file progress, parallel limit, validation feedback | [x] |
| 2.5 | Video preview dialog, metadata edit form, replace file, move to queue | [x] |
| 2.6 | Authenticated media streaming route (no public static media) | [x] |

---

## Phase 3 — Scheduling engine

| # | Task | Status |
|---|---|---|
| 3.1 | Interval mode with active hours/days/daily cap rollover | [x] |
| 3.2 | Fixed-time mode (first N times per day, surplus to next day) | [x] |
| 3.3 | Custom mode (explicit datetime slots, drag-reorder in UI) | [~] |
| 3.4 | Smart auto-distribution (derives per-day capacity from hours/interval) | [x] |
| 3.5 | Daily limits: GLOBAL and PER_ACCOUNT, existing-post occupancy | [x] |
| 3.6 | Timezone-aware conversion incl. DST gaps/overlaps | [x] |
| 3.7 | `POST /api/schedules/generate` persists batch + posts, enqueues jobs | [x] |
| 3.8 | Reschedule/recompute that never touches PUBLISHED/PUBLISHING rows | [x] |
| 3.9 | Calendar UI: month/week/list views, drag to reschedule | [x] |
| 3.10 | Settings → Posting Schedule and per-account overrides | [x] |

---

## Phase 4 — TikTok integration

| # | Task | Status |
|---|---|---|
| 4.1 | OAuth connect/callback with signed state, token exchange, refresh with lock | [x] |
| 4.2 | Account management UI + API (connect, list, default, disconnect) | [x] |
| 4.3 | Creator Info query before publish (duration/privacy/interaction constraints) | [x] |
| 4.4 | Direct Post init + status fetch | [x] |
| 4.5 | Inbox/Draft upload init + explicit "finish in TikTok app" UX | [x] |
| 4.6 | Mock TikTok API server for development and tests | [x] |

---

## Phase 5 — Automatic publishing

| # | Task | Status |
|---|---|---|
| 5.1 | BullMQ `publish` queue, deterministic `jobId` (`publish-<postId>`, no `:`), delayed jobs, pause/resume | [x] |
| 5.2 | Maintenance loop: enqueue due posts from SQLite (source of truth) | [x] |
| 5.3 | Atomic claim + capacity re-check inside the claim transaction | [x] |
| 5.4 | Retry with exponential backoff, max retries, dead-letter queue | [x] |
| 5.5 | Unknown-outcome handling → `MANUAL_ACTION_REQUIRED`, no blind retry | [x] |
| 5.6 | Status polling until `PUBLISH_COMPLETE`/`FAILED` | [x] |
| 5.7 | Recovery after restart (stale `PUBLISHING` rows, Redis flush) | [x] |
| 5.8 | Graceful shutdown, stalled-job handling, concurrency via env | [x] |
| 5.9 | Notifications: in-app + optional Telegram, all eight event types | [x] |
| 5.10 | Queue page: pause/resume, retry, cancel, live status | [x] |

---

## Phase 6 — Production readiness

| # | Task | Status |
|---|---|---|
| 6.1 | Test suites: scheduler, time, TikTok client, worker (Vitest) + live API smoke | [~] |
| 6.2 | Rate limiting, Origin/CSRF check, audit log, token redaction | [~] |
| 6.3 | Structured logging + `/api/health` + worker heartbeat | [x] |
| 6.4 | Backup script (`VACUUM INTO`) and restore procedure | [x] |
| 6.5 | Nginx config, Dockerfile, compose, `.env.example` | [x] |
| 6.6 | README: setup, operations, TikTok review requirements, limitations | [x] |

---

## Phase 7 — Caption & hashtag management (spec §12)

| # | Task | Status |
|---|---|---|
| 7.1 | Caption templates CRUD + default template | [x] |
| 7.2 | Hashtag presets, bulk caption edit with template placeholders | [~] |
| 7.3 | Length/hashtag-count validation against TikTok limits | [x] |

---

## Open decisions and assumptions

1. **Next.js API routes instead of NestJS.** Fewer runtime moving parts on a small VPS; the worker
   is still a separate process, which is the separation that matters. Revisit only if the API needs
   independent scaling.
2. **`scrypt` for passwords.** Spec allows Argon2/bcrypt; both need native builds. `scrypt` is
   stdlib, ASIC-resistant and memory-hard. Documented in `SYSTEM_DESIGN.md` §8.
3. **SQLite single writer.** Per-process `connection_limit=1` + Redis leases. Adding writers means
   moving to Postgres, not adding connections.
4. **`postingTimes` stored as JSON string** because SQLite has no arrays.
5. **TikTok `DIRECT_POST` availability is app-review dependent.** `TIKTOK_API_MODE=mock` is the
   development default; the UI shows a banner explaining which mode is active. Automatic publishing
   is verified against the mock API and the code follows the documented endpoints — it is *not*
   claimed to be production-verified until the app passes TikTok's audit.
6. **DST-ambiguous local times** resolve to the first (pre-transition) offset; nonexistent times roll
   forward by the gap. Both are pinned by `packages/shared/test/time.test.ts` (America/New_York
   spring-forward and fall-back cases, plus the 23-hour local day).
7. **Search** uses SQLite `LIKE` (case-insensitive) rather than FTS5: the library is thousands of
   rows at most, FTS5 adds schema and migration weight for no measurable gain here.
---

## Known gaps (the `[~]` rows)

- **3.3 CUSTOM mode** — the engine accepts explicit `customSlots` and the API validates them, but the
  generate dialog only offers INTERVAL/FIXED_TIME/SMART. Custom datetime entry today goes through
  the calendar's reschedule dialog per post.
- **6.1 API tests** — scheduler (20), time utils (14), TikTok client (16) and the worker publish
  pipeline (2) run under Vitest; REST handlers are exercised by the live smoke (register, connect,
  upload, generate, publish, stats, notifications), not by a per-route suite.
- **6.2 Audit trail** — rate limiting and the same-origin guard exist; there is no separate audit
  table. `PublishingLog` is the auditable record for publishing; CRUD changes are not tracked.
- **7.2 Hashtag presets** — hashtags are a per-video field plus caption templates; no reusable preset
  list, because templates already cover the repeated-hashtag case.
