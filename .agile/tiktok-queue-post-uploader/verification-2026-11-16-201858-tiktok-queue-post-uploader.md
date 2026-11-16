# Verification — content list filter/sort/pagination

Session: 2026-11-16-201858-tiktok-queue-post-uploader · Target: `http://192.168.1.11:3100/content` (live, pm2 `tiktok-scheduler-web`, build `3d87353`)

Method: a temporary `tts_session` was minted against the prod SQLite DB, the page was driven over CDP (Moli service, `127.0.0.1:9223`) recording every `Network.requestWillBeSent` whose URL contains `/api/videos`, and the session row was deleted afterwards (`deleted sessions: 1` for both `tiktok-scheduler.db` and `demo.db`).

## Acceptance criterion → evidence

### 1. Initial load sends paging, sort and order; sends no empty filters
```
initial_requests ["/api/videos?page=1&pageSize=20&sort=createdAt&order=desc"]
initial_dom      {"rows":20,"pager":"Page 1 of 5 · 88 videos","prevDisabled":true}
```
No `status=` and no `q=` in the URL — an empty `status=` would have returned HTTP 422 (checked directly: `curl … "/api/videos?status=&page=1&pageSize=20"` → `422`).

### 2. Status tab filters
```
ready_requests ["/api/videos?status=READY&page=1&pageSize=20&sort=createdAt&order=desc"]
ready_dom      {"rows":20,"badges":["ready"],"empty":false}
```
Server agrees: `?status=READY` → `{"page":1,"totalPages":1,"total":20,"n":20,"statuses":["READY"]}` (prod holds 39 PUBLISHED / 20 READY / 29 SCHEDULED).

### 3. Sort select changes the server ordering
```
sort_title_requests ["/api/videos?status=READY&page=1&pageSize=20&sort=title&order=desc"]
title_desc ["ustadz_yazid_abdul_qadir_jawas_kiat_kiat_islam_mengatasi_kemiskinan_c10", "…_c09", "…_c08", "…_c07"]
title_asc  ["c01","c02","c02","c03"]
flipped true
```

### 4. Order toggle flips direction and resets to page 1
```
order_toggle_requests ["/api/videos?status=READY&page=1&pageSize=20&sort=title&order=asc"]
```

### 5. Search reaches the server after debounce
```
search_requests ["/api/videos?status=READY&q=ustadz&page=1&pageSize=20&sort=title&order=asc"]
```
Server: `?q=ustadz` → `{"total":83,"n":20}` out of 88.

### 6. Pagination advances and the footer tracks it
```
pagination_requests ["/api/videos?page=2&pageSize=20&sort=title&order=asc"]
page1 {"n":20,"pager":"Page 1 of 5 · 88 videos","prevDisabled":true}
page2 {"n":20,"pager":"Page 2 of 5 · 88 videos","prevDisabled":false}
```
Page 2 returns a different first row id (`cmwj7pl0p000jxa5rkvxbqfto`) than page 1 (`cmwj89gix002rxa5rw0cpeh3f`).

## Build/type/unit gates
See `test-report-2026-11-16-201858-tiktok-queue-post-uploader.md`: typecheck clean, 79 tests pass, lint errors all pre-existing.

## Residual
- The remote checkout still holds the pre-existing WIP (8 modified files + `apps/web/components/video/schedule-post-dialog.tsx`) uncommitted; it is now also built into the running app, as it was before this change. It will conflict-free-merge when committed on top of `3d87353`.
