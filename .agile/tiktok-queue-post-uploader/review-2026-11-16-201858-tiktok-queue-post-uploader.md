# Code review — content list filter/sort/pagination

Session: 2026-11-16-201858-tiktok-queue-post-uploader · Verdict: **PASS**

## Diff
`apps/web/app/(dashboard)/content/page.tsx` (+18 −3)

1. `queryFn` builds `URLSearchParams` from `queryParams`, dropping empty values, and requests `/api/videos?…`.
2. Sort `<Select>` and the asc/desc toggle both `setPage(1)`.

## Correctness
- Empty `status`/`q` are filtered out before the request. Confirmed necessary: `status=` on the live API returns **422** (`z.enum(VIDEO_STATUSES)` rejects `''`).
- `queryKeys.videos(queryParams)` (`apps/web/lib/api-client.ts:64`) already keys on the params object, so each control change produces a new key and a refetch. No cache-key change needed.
- `placeholderData: (prev) => prev` keeps the table from flashing empty between pages; the previous page stays visible until the new one lands. Acceptable, unchanged behavior.
- Page reset on sort/order prevents an out-of-range `page` after reordering (e.g. page 5 of a 2-page result set).
- Server side untouched: `/api/videos` already accepted all six params. No new endpoint, no DTO change.

## Scope
- One file, one behavior. No refactor, no dead code, no new dependency.
- `Object.entries(...).filter(...)` matches the existing pattern in `apps/web/app/(dashboard)/logs/page.tsx` — no second convention introduced.

## Pre-existing issues seen, not touched
- `npm run lint` reports 4 errors in `settings/page.tsx`, `ecosystem.config.cjs`, `packages/scheduler/src/engine.ts` — all present at `d710d18`.
- Prisma client was stale vs the `d710d18` migration (`dailyPostingLimit` dropped); `prisma generate` was required before typecheck/build. Not a code change.

## Deployment note
Remote `thinkcentre:~/Projects/tiktok-scheduler` carried 8 uncommitted files + `schedule-post-dialog.tsx` (WIP on this same file). The commit was applied as a patch (`git apply`, context-only) — WIP preserved and still uncommitted, no pull, no stash.
