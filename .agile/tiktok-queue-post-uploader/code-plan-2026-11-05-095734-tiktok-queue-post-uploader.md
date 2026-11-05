# CODE PLAN — mass scheduler

## Data flow
`QueuePage` selection (scheduled post ids) → `MassScheduleDialog` → `POST /api/schedules/bulk-reschedule`
→ `massReschedulePosts` (packages/db) → per-post `computeMassRescheduleInstant` → single
transaction (updates + `SCHEDULE_CHANGED` logs + one notification) → `cancelPublishJob` +
`armPublishJob` per post → queue/schedules queries invalidated.

## Files
| File | Change |
|---|---|
| `packages/shared/src/schemas.ts` | `massRescheduleSchema` (discriminated union TIME/DATE), `MassRescheduleInput`; removed unused `rescheduleBatchSchema` |
| `packages/db/src/mass-schedule.ts` | new pure `computeMassRescheduleInstant` |
| `packages/db/src/scheduling.ts` | `massReschedulePosts`, `MassRescheduleResult` |
| `packages/db/src/index.ts` | exports |
| `apps/web/app/api/schedules/bulk-reschedule/route.ts` | new endpoint |
| `packages/db/test/mass-schedule.test.ts` | pure unit test |
| `apps/web/lib/types.ts` | `MassRescheduleResult` |
| `apps/web/app/(dashboard)/queue/page.tsx` | selection column, select-all, toolbar, `MassScheduleDialog` |

## Decisions
- Capacity/interval rules are not re-checked in bulk: the user is moving their own pending queue,
  and rejecting 40 of 50 posts on a shared minute would make the feature useless. Immutability is
  still enforced per post.
- Same-account collisions are spaced by 1 minute so the worker never fires a burst in one minute;
  `staggered` reports it and the toast says so.
- Selection uses the existing `Checkbox` primitive; the row checkbox guards non-selectable statuses
  in `onChange` because the primitive has no `disabled` prop.

## Regression areas
Single-post reschedule (`rescheduleScheduledPost`) untouched; queue page retry/cancel/caption flows
unchanged; publishing worker contract unchanged.
