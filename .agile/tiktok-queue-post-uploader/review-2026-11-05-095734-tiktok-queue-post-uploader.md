# CODE REVIEW — mass scheduler

Independent reviewer (`reviewer` agent) on the diff; verdict **PASS** after one fix round.

## Round 1 — CHANGES_REQUIRED

1. **Prefill used the browser timezone instead of the post timezone** (`queue/page.tsx`):
   an unchanged Save would shift every post's wall clock when the browser TZ differs from the
   posting TZ. Fix: queue DTO now exposes `localDate` (server-computed with
   `post.timezone || user.timezone`), dialog initialises from `localDate` / `localTime`.
2. **`selectedIds` never pruned** when the 10s poll removes rows: count could inflate and the
   dialog could submit `postIds: []`. Fix: prune effect keyed on `data`, dialog items filtered by
   the shared `isMassSelectable`, dialog renders only when the selection is non-empty.

## Round 2 — PASS

> both findings correctly fixed, no remaining concrete bugs in the delta … ownership via
> `account: { userId }`; PENDING/QUEUED/FAILED mutate, others `POST_IMMUTABLE`, unknown
> `POST_NOT_FOUND`; per-post timezone fallback; single transaction; cancel-then-arm re-arm;
> stagger per-account, deterministic; payloads match `massRescheduleSchema` exactly.

Confidence 0.8.
