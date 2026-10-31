# CODE_REVIEW — 2026-11-01-004630

Independent pass over the integrated tree (orchestrator, after all slices landed). Verdict: **PASS**
after the fixes below; every finding is fixed and re-verified in `verification-2026-11-01-004630-*.md`.

## Blocking findings (fixed)

| # | Finding | Where | Fix |
|---|---|---|---|
| 1 | `PRAGMA busy_timeout = …` via `$executeRawUnsafe` throws in SQLite ("Execute returned results") — `ready()` failed in every process | `packages/db/src/client.ts` | PRAGMAs that return a row use `$queryRawUnsafe` |
| 2 | BullMQ v6 rejects `:` inside custom job ids; `armPublishJob` swallowed the error, so scheduled posts silently never armed | `packages/queue/src/index.ts`, `apps/worker/src/main.ts` | Ids use `-`; `armPublishJob` logs the failure instead of returning `false` quietly |
| 3 | Relative `STORAGE_ROOT` resolved against each workspace cwd, so the web app and worker used different folders → `FILE_MISSING` at publish time | `packages/media/src/storage.ts` | Relative env paths resolve against the repository root (`@tiktok-scheduler/shared/paths`) |
| 4 | Mock mode still pointed at `open.tiktokapis.com`, so a mock run would hit the real API with fake tokens | `apps/worker/src/main.ts` | The worker hosts the in-process mock API and overrides `TIKTOK_API_BASE_URL` |
| 5 | The maintenance tick only swept due posts — stale-claim recovery and the daily backup never ran | `apps/worker/src/main.ts` / `maintenance.ts` | Tick calls `runMaintenance()` (recover → rearm → sweep → backup) |
| 6 | `node:fs` leaked into a client chunk through the shared barrel after adding path helpers (Turbopack: "does not support external modules") | `packages/shared/package.json` | Helpers exposed as `@tiktok-scheduler/shared/paths` subpath, not on the root barrel |
| 7 | `getEffectivePolicy` returned a global cap under `PER_ACCOUNT`, double-limiting throughput | `packages/db/src/settings.ts` | `globalDailyLimit` is `null` unless `limitScope = GLOBAL` |
| 8 | Parallel subagents spliced stray lines into `calendar/page.tsx` (two `<Select>`/`Tabs` fragments mid-destructuring) | `apps/web/app/(dashboard)/calendar/page.tsx` | Removed the orphan statements, restored the deleted `apiFetch` reschedule call, verified with esbuild → tsc |
| 9 | UI assumed `Button asChild` and `mutation.submit()` APIs that the primitives do not have | `components/ui/button.tsx` consumers | Links use `buttonVariants`; mutations call `mutate` |

## Non-blocking notes (accepted)

- `maskSecret` is exported but unused: nothing currently logs a token, so redaction has no call site.
- Login already answers `401 INVALID_CREDENTIALS` for both unknown email and wrong password.
- The publish judgement never retries after a publish id exists; the only retryable paths are
  pre-init failures (rate limit, network), which cannot duplicate a post.
- `/library` link (a page that does not exist) pointed at the content library; fixed to `/content`.
- No CSRF token — `SameSite=Lax` cookie plus the same-origin check on state-changing requests.