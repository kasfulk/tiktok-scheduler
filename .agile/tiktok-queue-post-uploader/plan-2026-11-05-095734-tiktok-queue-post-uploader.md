# PLAN — mass scheduler

## Frozen contract
`POST /api/schedules/bulk-reschedule`

Request (zod discriminated union on `mode`):
```json
{ "postIds": ["post_1"], "mode": "TIME", "time": "19:30" }
{ "postIds": ["post_1"], "mode": "DATE", "date": "2026-12-01" }
```

Response `data`:
```ts
{ updated: number; staggered: number; skipped: { id: string; code: string; message: string }[] }
```

## Slices (parallel, disjoint files)
### A — backend
- `packages/shared/src/schemas.ts`: add `massRescheduleSchema` + `MassRescheduleInput`; delete the
  unused `rescheduleBatchSchema`.
- `packages/db/src/mass-schedule.ts` (new, pure): `computeMassRescheduleInstant(current, mode, value, timezone)`.
- `packages/db/src/scheduling.ts`: `massReschedulePosts({ userId, postIds, mode, value, fallbackTimezone })`.
- `packages/db/src/index.ts`: export both.
- `apps/web/app/api/schedules/bulk-reschedule/route.ts` (new).
- `packages/db/test/mass-schedule.test.ts` (pure unit test).

### B — frontend
- `apps/web/lib/types.ts`: `MassRescheduleResult`.
- `apps/web/app/(dashboard)/queue/page.tsx`: selection column, select-all, toolbar, `MassScheduleDialog`.

## Order
A and B in parallel (contract above). Integration + live verification by the orchestrator.

## Risks
- Timezone regressions → per-post timezone, unit test covers wall-clock preservation.
- Same-minute bursts → 1-minute stagger, reported.
- Large selections → 200 post cap, single transaction, batched `createMany` logs.

## Acceptance
As in the brainstorm; proven by typecheck, unit test, and a live run on `/queue`.
