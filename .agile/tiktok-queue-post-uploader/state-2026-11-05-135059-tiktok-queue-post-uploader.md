scope: tiktok-queue-post-uploader
session: 2026-11-05-135059-tiktok-queue-post-uploader
stage: COMPLETE
status: PASS
updated: 2026-11-05 14:00
classification: BUG
completed: [intake, root_cause, coding, review, testing, verification]
current: []
next: []
changes:
  - apps/web/app/(dashboard)/calendar/page.tsx
  - apps/web/lib/schedule-payload.ts
  - apps/web/test/schedule-payload.test.ts
notes: >
  Reported: generate schedule ignored the requested hours and used defaults.
  Root cause: the dialog sent `startTime` only for FIXED_TIME, so INTERVAL/SMART plans fell back to
  `activeHours.start`; SMART also omitted `intervalMinutes`, which the schema requires (422).
  Fix: `buildGenerateScheduleBody` builds the payload (INTERVAL/SMART anchor on start time + interval,
  FIXED_TIME on posting times) and rejects times outside the active hours; the dialog now exposes
  Start time and Interval for both interval modes, gains an add-time control for fixed mode, drops
  the ignored Start time field there, and defaults Start date to the user's local day.
excluded_from_diff:
  - apps/worker/test/publish.test.ts — collection error for @tiktok-scheduler/browser, identical
    with this change stashed (pre-existing, surfaced only because local Redis enables those tests)
skipped:
  - DEEP_RESEARCH: no external uncertainty — defect reproduced in the local engine
  - CODE_PLAN: single dialog + one pure helper + one test file
