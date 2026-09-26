# MOViDO — Production Readiness Progress

Last updated: 2026-09-26 · Branch `claude/new-session-7ppjph` (from `main` @ `439a497`)
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
  (`qa-admin@…`, `qa-driver@qa.movidologistics.uk`, no e-mail sent). The
  production domain itself could not be browsed from this environment.
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

## PASS / FAIL / BLOCKED

| Area | Status | Evidence |
|---|---|---|
| Authentication (login, invalid credentials, gates) | PASS | Browser: wrong password → "Invalid login credentials"; `/dashboard /jobs /driver /settings` → login when signed out |
| Session persistence / refresh | PASS | Reloads kept the session in every browser run |
| RBAC | PASS | Driver login lands on `/driver`; `/jobs` redirects back to `/driver` |
| RLS / organisation isolation | PASS | Role probes: cross-org select/update/delete = 0 on drivers, vehicles, jobs, messages, maintenance, storage; anon sees nothing; self-promotion blocked |
| Onboarding (new company) | PASS | Browser |
| Vehicles create | PASS | Browser 201, listed, persisted |
| Drivers create | PASS | Browser, persisted |
| Jobs create / 8 stops / assign / persist | PASS | Browser 201; DB row verified |
| More than 8 stops | PASS | 10-stop job via RLS as admin; driver RPC handled index 9 |
| Driver workflow (start → 8 stops → POD photo + signature → complete) | PASS | Browser at 390px; DB: 8/8 stops, completed_at, photo in private bucket, signature |
| POD viewing (dispatcher) | PASS | Signed URL image loaded; public URL rejected |
| Customer tracking | PASS | Browser; no phone numbers; completed state |
| Routing (TomTom truck, height/weight, traffic) | PASS | Live API call returned route + traffic fields |
| CSV export (jobs) | PASS | Browser download |
| TypeScript / build | PASS | `tsc` 0 errors; `vite build` OK |
| Stripe webhook signature rejection | PASS | Unsigned → 400, forged → 400 (proves secrets are set) |
| Stripe paid checkout / signed webhook event / subscription record | **BLOCKED** | Needs Stripe test-mode access (or the webhook secret) and the price ids set as Supabase function secrets |
| Live GPS tracking / geofencing on real devices | **BLOCKED** | Needs a driver device sharing location; web workspace does not yet send GPS |
| Realtime updates | **BLOCKED** | Websockets are blocked by this environment's proxy |
| Messaging, Incidents, Fuel, Document Scanner, Analytics, Reports | Not re-tested in browser this pass | RLS isolation for messages verified; pages load |
| Production domain smoke test after deploy | **BLOCKED** from here | Environment cannot browse `movidologistics.uk`; verify with the checklist below |
| Leaked-password protection | **FAIL (config)** | Supabase Auth setting — enable in dashboard |

## Remaining work / known gaps

1. **Billing end-to-end**: set `STRIPE_PRICE_STARTER_MONTHLY/ANNUAL`, `STRIPE_PRICE_PRO_MONTHLY/ANNUAL`
   as **Supabase function secrets** (checkout returns `BILLING_NOT_CONFIGURED` otherwise), point the
   Stripe webhook at `/functions/v1/stripe-webhook`, then run one test-mode checkout.
2. **Trial expiry is not enforced** — `trial_ends_at` is stored and shown, nothing blocks access afterwards. Business decision (the Movido org itself is past its original trial date).
3. **Driver GPS**: the driver workspace does not push location; live map positions depend on data
   that is not being produced by any deployed client.
4. The Expo app (`movido-driver`) and `movido-driver-web` are out of date with the schema and are
   not deployed; treat `/driver` as the supported driver client or rebuild them against the current schema.
5. Admins cannot list/manage their organisation's users (users RLS = own row only).
6. Supabase Auth: enable leaked-password protection; configure custom SMTP for reliable recovery mail.
7. Vercel flags `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `DATABASE_URL`, `RESEND_API_KEY` as
   readable secrets — mark them Sensitive (they are not needed by the Vite frontend at all).
8. `movido-driver` repo commits a `.env` (anon key + TomTom key — client-side keys, but should not be committed).

## QA data left in production (isolated, safe to keep or delete)

- Organisation "QA Isolated Haulage Ltd" with 2 vehicles, 1 driver, 1 completed job (+ 1 POD photo).
- Auth users `qa-admin@qa.movidologistics.uk` (admin) and `qa-driver@qa.movidologistics.uk` (driver).
- Existing Movido data (6 drivers, 8 vehicles, 10 jobs) was not modified.

## Database changes (all in `supabase/migrations/`, applied to production)

010 app_settings per org · 011 private POD storage · 012 onboarding + org policies ·
013 NOT NULL integrity · 014 driver workflow · 015 per-org uniqueness · 016 driver maintenance read.
Edge Functions deployed: `create-checkout-session` v11, `stripe-webhook` v6.

## Post-deploy checklist (production)

1. Sign in as the Movido admin → Dashboard, Jobs, Settings show Movido data and the real company name.
2. Create a job with several stops, reload, confirm it persists.
3. Sign in as a driver → lands on `/driver`, can start a job, mark stops, complete with photo.
4. Open a job's tracking link in a private window.
