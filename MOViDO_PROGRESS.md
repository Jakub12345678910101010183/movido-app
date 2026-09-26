# MOViDO — Production Readiness Progress

Last updated: 2026-09-26 · Deployed to production from `main` @ `334ac81` (PR #3)
Supabase project `zjvozjnbvrtrrpehqdpf` · Vercel project `movido-app` · Domain `www.movidologistics.uk`

Status legend: **PASS** = actually exercised and verified · **FAIL** = tested and broken ·
**BLOCKED** = could not be verified (external dependency / missing access).

## How things were verified

- **Database/RLS:** behavioural tests run as real roles (`set role authenticated` +
  JWT claims for the admin, driver and a second-organisation user, plus `anon`)
  inside transactions that always roll back. Nothing from these probes persisted.
- **Real browser:** Playwright + Chromium against a local production build wired
  to the production Supabase project, using an isolated QA company
  ("QA Isolated Haulage Ltd") and two QA logins created for this purpose
  (`qa-admin@…`, `qa-driver@qa.movidologistics.uk`, no e-mail sent).
- **Production domain:** after deploy, the same Playwright flows were run against
  `https://www.movidologistics.uk`. This environment's proxy drops Chromium's own
  connections, so the browser's HTTP requests were relayed unchanged through Node
  `fetch` (file uploads went directly from the browser).
- **Live services:** TomTom truck routing and the Stripe webhook endpoint were
  called directly.

## Fixed in this pass

### Security / multi-tenancy (P0)
| Issue | Fix | Verified |
|---|---|---|
| `app_settings` was one global table writable by admin/dispatcher of **any** organisation | Per-organisation rows; platform defaults read-only (migration 010) | PASS (org B write to global → 0 rows; to org A → 42501) |
| `pod-photos` bucket **public** with **no** storage policies (uploads rejected; objects world-readable) | Private bucket, `<org>/<job>/` paths, org/driver-scoped policies, signed URLs (011) | PASS (cross-org read 0, other-job upload 42501, public URL → 400, signed URL loads) |
| `jobs.reference`, `vehicles.vehicle_id`, `drivers.email` unique across **all** tenants (new customer's first job 409'd; conflicts leaked other tenants' values) | Unique per organisation (015) | PASS (QA org created `JOB-2026-001` while Movido also has it) |
| Stripe checkout not bound to an organisation; empty price allowlist accepted any price | Admin-only, org-bound checkout; allowlist mandatory | Code + deploy; see Billing |
| Stripe webhook used sync `constructEvent` (always fails on Deno) and wrote plan to `users` by e-mail, guessing plan from price-id spelling | `constructEventAsync`, writes `organizations`, plan from configured price ids, audited | PASS for signature rejection; BLOCKED for a signed event |

### Product (P0/P1)
| Issue | Fix | Verified |
|---|---|---|
| New sign-ups got role `pending` + no organisation and **nothing could create one** — no self-service customer could ever use the product | `create_organization()` RPC + onboarding form; becomes admin, 14-day trial (012) | PASS in browser |
| **No working driver app in production** (Expo + driver-web target columns that don't exist; neither is deployed) | `/driver` mobile workspace in the deployed app; `driver_update_stop()` RPC; guard keeps signature and stamps `completed_at` (014) | PASS in browser, 390px |
| Add/Edit Job dialog rendered `<SelectItem value="">` (Radix throws) | Sentinel value | PASS (dialog opens, job saved) |
| Job ETA stored on 1970-01-01 | Scheduled date + time → real timestamp | PASS (`2026-09-27 14:30`) |
| Jobs "Export" was "coming soon" | Real CSV export | PASS (file downloaded) |
| Maintenance offered 6 types the DB enum rejects (only MOT saved) | Options = enum | Code-verified |
| Geofencing read `job_id` from rows that only have `id` | Mapping fixed | Code-verified |
| WTD **fabricated drive hours** with a seeded pseudo-random function | Uses recorded hours only + "not tachograph data" notice | Code-verified |
| Sidebar showed "John Doe / Dispatcher" for everyone; fixed "3" badges; dead header search; clock always "GMT" | Real user/role + sign-out, no fake counts, search → Jobs, BST/GMT | PASS in browser |
| Route planner "Export" only toasted fake success; traffic disabled | Opens optimised sequence in Google Maps; live-traffic truck routing | TomTom PASS (live call) |
| Settings company section hard-coded "Movido Logistics Ltd"; profile save wrote a non-existent column and always toasted success | Reads/saves the real organisation (admin only, billing fields protected by trigger); real errors | PASS in browser |
| One failed profile read → "No access" until sign-out; hung requests → endless spinner | Retries + per-request timeouts + "Try again" | PASS (survived dropped requests) |
| Driver writes failed outright on a dropped request | Idempotent retries; RPC result applied locally | PASS (3 dropped requests, flow still completed) |
| Dispatch layout unusable on phones (560px forced width) | Drawer sidebar, responsive header/dashboard | PASS (no overflow on 8 pages at 390px) |
| Landing demo: 12 drops with wrong coordinates and hard-coded savings | 8 real Midlands drops, distances computed (nearest-neighbour + 2-opt) | PASS in browser |
| Tracking: stale ETA shown as "Arriving now", last step never ticked, every customer branded "Movido Logistics • Northampton" | Fixed | PASS in browser |
| Driver could insert maintenance but not read it | Driver SELECT for own vehicle (016) | PASS (probe) |
| Stale hand-written DB types (29 TS errors on this branch, 53 on old main) | Types mirror production schema; status columns NOT NULL (013) | PASS (`tsc` 0 errors) |

### Final push (migrations 017–020, PR #3)
| Issue | Fix | Verified |
|---|---|---|
| Driver app never sent GPS; live map had no real data source | `/driver` shares browser geolocation (watchPosition, ≥15 s / ≥50 m, resend on failure, denied/unsupported states); `driver_report_location()` resolves org, driver, vehicle and active job in the DB; `driver_positions` history (017) | PASS: local build + production — "Sharing live location · sent", rows in `driver_positions`, driver marker on dispatch map |
| Client-side geofencing only ran with the dashboard open and read wrong fields | Server-side geofencing in Postgres on every reported fix: pickup/stop/delivery arrival ≤150 m, departure >300 m, unique per job/target/event, stop marked arrived, pickup arrival starts job (018) | PASS (DB probes + browser: events listed in job detail; duplicates ignored; other org sees none) |
| Admins could not see or manage their organisation's users | `/team` + `admin_set_user_role / admin_remove_user / admin_add_user` with DB checks (admin only, same org, not self, owner protected, last admin kept, driver accounts stay drivers), audit log; `disabled` role blocks dispatch (019) | PASS (browser + role probes incl. cross-org → USER_NOT_FOUND) |
| Incidents / Fuel had no way to create records | Create forms for dispatch and drivers; RLS checks driver/vehicle/job are same-org, drivers file only as themselves (020) | PASS (browser, both roles, persisted) |
| Document scanner kept results in memory only | Private `documents` bucket (org folders) + `documents` table; history reloads with signed URLs; failed OCR download retried | PASS (row + 94 KB object; visible after reload) |
| Messaging was one-way / per-sender | Shared driver ↔ dispatch threads, driver Messages view | PASS (both directions in browser) |
| Reports could generate an empty CSV before data loaded | Generate waits for all data; aborts with an error if a load failed | PASS (jobs CSV with rows) |
| Analytics "on-time" was not computed | Completed within 15 min of ETA | PASS (browser) |
| Incident submit hung while the location permission prompt was open | Location lookup capped at 6 s | PASS (saved with prompt unanswered; with permission → lat/lng stored) |
| Stripe checkout failed with an opaque error when price and key are in different modes | Price validated first → `PRICE_UNAVAILABLE`/`PRICE_INACTIVE`; stale customer ids recreated | PASS (explicit error; see Billing) |

## PASS / FAIL / BLOCKED

| Area | Status | Evidence |
|---|---|---|
| Authentication / session / RBAC | PASS | Browser (local build + production domain) |
| RLS / organisation isolation (16 tables + storage + new tables/RPCs) | PASS | Rolled-back role probes: cross-org select/update/delete = 0; anon nothing; team RPCs cross-org → USER_NOT_FOUND; driver cannot insert positions directly; documents/POD storage org-scoped |
| **Production: admin login, dashboard** | PASS | `www.movidologistics.uk` |
| **Production: create job (stops, assigned driver)** | PASS | `JOB-2026-003`, `JOB-2026-004` created |
| **Production: team page** | PASS | Only QA org members listed (no Movido users) |
| **Production: driver login + GPS permission + position sent** | PASS | "Sharing live location · sent 12:56:17"; `driver_positions` rows |
| **Production: start → deliver stop → POD photo + signature → complete** | PASS | "Delivery completed"; photo 47 550 bytes in private bucket |
| **Production: driver marker on dispatch live map** | PASS | Marker element "QA Driver" on dashboard map |
| **Production: POD view (signed photo)** | PASS | Image loaded from signed URL |
| **Production: public tracking link** | PASS | Delivered state, no phone numbers; invalid token → "Tracking link not found or expired" |
| Geofencing (server-side) | PASS | Arrival/departure events, dedupe, org isolation; runs whenever a driver's phone reports, dashboard not needed |
| Background GPS (screen off / app closed) | **BLOCKED (platform)** | Browsers stop geolocation in the background; the driver screen says so. Needs a native app |
| Messaging / Incidents / Fuel / Documents / Analytics / Reports | PASS | Browser, persisted, reload checked |
| Map tile visuals | **BLOCKED** | Headless Chromium here renders WebGL black; markers verified in DOM |
| Realtime websockets | **BLOCKED** here | Proxy blocks websockets; 15–20 s polling fallback verified |
| Stripe: admin-only, org-bound, price allowlist (4 ids set) | PASS | Driver → 403; unknown price → INVALID_PRICE |
| Stripe TEST checkout | **BLOCKED** | Supabase `STRIPE_SECRET_KEY` is a **test** key but the 4 price ids are **live** prices → `PRICE_UNAVAILABLE` |
| Stripe signed webhook event / subscription record | **BLOCKED** | No access to the webhook secret / Stripe dashboard; unsigned & forged events → 400 |
| TypeScript / build / deploy | PASS | `tsc` 0 errors; `vite build` OK; Vercel production READY, domain serves new bundle |
| Leaked-password protection | **FAIL (config)** | Supabase Auth setting |

## Remaining work / needs the owner

1. **Stripe**: put the secret key and webhook secret in the **same mode as the price ids** (live key +
   live webhook secret, or create test prices and set those ids) in Supabase function secrets; point the
   webhook at `https://zjvozjnbvrtrrpehqdpf.supabase.co/functions/v1/stripe-webhook`; run one checkout.
2. **Trial expiry is not enforced** — business decision.
3. Supabase Auth: enable leaked-password protection; configure custom SMTP.
4. Vercel: mark `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `DATABASE_URL`, `RESEND_API_KEY` Sensitive (not used by the frontend).
5. `movido-driver` repo commits a `.env`; Expo / driver-web apps are out of date — `/driver` is the supported driver client.
6. Background location needs a native app (browser limitation).
7. Marketing claims ("99.9% uptime", "24/7 support") and the sales mailbox must be backed by the business.

## QA data left in production (isolated, safe to keep or delete)

- Organisation "QA Isolated Haulage Ltd" (`a42e18f2-…1658`): 2 vehicles, 1 driver, jobs `JOB-2026-001…004`
  (003's POD photo is a 0-byte test artifact from a harness bug, fixed before 004), driver positions,
  geofence events, messages, incidents, fuel logs, 1 scanned document.
- Auth users `qa-admin@qa.movidologistics.uk` (admin) and `qa-driver@qa.movidologistics.uk` (driver).
- Existing Movido data was not modified.

## Database changes (all in `supabase/migrations/`, applied to production)

010 app_settings per org · 011 private POD storage · 012 onboarding + org policies ·
013 NOT NULL integrity · 014 driver workflow · 015 per-org uniqueness · 016 driver maintenance read ·
017 driver positions · 018 server geofencing · 019 team management · 020 incidents/fuel/documents.
Edge Functions: `create-checkout-session` v12, `stripe-webhook` v6.
