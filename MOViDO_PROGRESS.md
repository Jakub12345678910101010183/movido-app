# MOViDO — Production Readiness Progress

Last updated: 2026-09-26 · Deployed to production from `main` @ `fbb111b` (PR #5)
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
| Document scanner kept results in memory only | Private `documents` bucket (org folders) + `documents` table; history reloads with signed URLs; failed OCR download retried | PASS (DB row + storage object in org folder; visible after reload with signed image) |
| Messaging was one-way / per-sender | Shared driver ↔ dispatch threads, driver Messages view | PASS (both directions in browser) |
| Reports could generate an empty CSV before data loaded | Generate waits for all data; aborts with an error if a load failed | PASS (jobs CSV with rows) |
| Analytics "on-time" was not computed | Completed within 15 min of ETA | PASS (browser) |
| Incident submit hung while the location permission prompt was open | Location lookup capped at 6 s | PASS (saved with prompt unanswered; with permission → lat/lng stored) |
| Stripe checkout failed with an opaque error when price and key are in different modes | Price validated first → `PRICE_UNAVAILABLE`/`PRICE_INACTIVE`; stale customer ids recreated | PASS (explicit error; see Billing) |

### Commercialisation pass (PR #5)
| Issue | Fix | Verified |
|---|---|---|
| Landing / pricing / login claimed 99.9% uptime, 24/7 support, 15% fuel savings, "<2s" updates, AI/ML ETA, offline mode, push notifications, DVSA/tachograph compliance, "TomTom partnership", "trusted by logistics companies" | Rewritten to describe real features only; ROI calculator uses the visitor's own estimates and says savings are not guaranteed; tachograph disclaimer in FAQ | PASS (production pages) |
| "Start Free Trial" sent visitors to a **paid** Stripe checkout while promising "no card needed" | Trial CTAs open sign-up (`/login?mode=register`); new companies get the 14-day trial | PASS (production) |
| Route planner + dashboard map showed **8 invented low bridges** and **wrong CAZ charges** (car ULEZ price for HGVs, a Manchester charging zone that does not exist) | Fake bridges removed (TomTom truck routing already uses vehicle height/weight); one shared UK charging-zone list, no amounts, links to GOV.UK | PASS (code + production UI) |
| Dashboard "AI ETA Predictions" were hard-coded regions with fake confidence % | Real open jobs sorted by ETA + count of jobs past ETA | PASS (production) |
| Dark (default) and satellite map styles pointed at TomTom styles that return **404** — only "Light" could load | Built-in `basic_night` / `hybrid_night` styles | PASS (no TomTom 4xx on production; map pixels not viewable headless) |
| Dashboard had no main navigation; map below all lists on phones | Uses the app layout; map first on mobile | PASS (screenshots) |
| Settings: 6 switches nothing read; fuel card styled for a light theme on the dark UI | Removed dead switches, CAZ preference now drives the map, fuel card themed; admins get "View plans and subscribe" | PASS |
| Landing image captioned "Movido Dispatch Center Dashboard" was a stock trading-floor photo with Bloomberg branding; CTA image was an AI map with garbled place names | Both deleted; labelled dispatch illustration; social image → fleet photo | PASS |
| Mixed-language link ("Odzyskaj konto"), "John Doe" placeholders, "Supabase" jargon in UI | Fixed | PASS |
| Accessibility: 15 icon-only buttons without names, dead header bell, `maximum-scale=1` blocked zoom, CTAs were a button inside a link (two tab stops) | Named, bell opens Alerts, zoom allowed, `Button asChild` | PASS (automated check + keyboard walk) |
| Stat grids of 4–5 columns and toolbars clipped at 390 px on 12 pages; job table wrapped references/badges | Responsive grids/toolbars, no-wrap cells | PASS (no horizontal overflow on 22 screens × 3 widths) |
| Vercel: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `DATABASE_URL`, `RESEND_API_KEY` flagged "readable secret" | Converted to **Sensitive** (production + preview) | PASS (type = sensitive; deployment builds and runs) |

## PASS / FAIL / BLOCKED

| Area | Status | Evidence |
|---|---|---|
| Authentication / session / RBAC / disabled accounts | PASS | Browser on production; rolled-back probe: disabled account sees 0 rows, cannot update |
| RLS / organisation isolation (jobs, drivers, vehicles, documents, positions, geofence events, messages, maintenance, incidents, fuel, users, storage) | PASS | Rolled-back probe as another company's admin: all 0; update 0 rows; team RPC → USER_NOT_FOUND |
| Driver restrictions | PASS | Other-org jobs 0, cannot update them, cannot file fuel as another driver, cannot insert positions directly, admin RPC → ADMIN_ONLY, documents 0 |
| Anonymous / tracking links | PASS | anon jobs/users 0; bad/empty token → 0 rows; valid link shows status without phone number |
| **Production E2E**: sign-up CTA, admin login, dashboard, create job, Team, driver login, GPS sent, start → deliver → photo + signature → complete, driver marker on map, POD view | PASS | `www.movidologistics.uk`, run after PR #5 (JOB-2026-005) |
| **Production modules**: Analytics, Reports CSV, Incident, Fuel, Messaging (persists after reload), Document Scanner (OCR + saved), Settings plan link, ETA panel | PASS | Same run |
| Geofencing (server-side, works without dashboard open) | PASS | Earlier pass, unchanged |
| Map styles load | PASS | No TomTom 4xx on production after fix |
| Map visuals (tiles/markers drawn) | **BLOCKED** | Headless Chromium here does not composite the WebGL canvas; check once in a normal browser |
| Background GPS (screen off / browser closed) | **BLOCKED (platform)** | Browser limitation, stated on the driver screen and landing page; needs a native app. `movido-driver` (Expo) exists but is out of date with the schema |
| Responsive (390 / 820 / 1440) | PASS | 22 screens: no horizontal overflow, no broken images |
| Accessibility basics | PASS | Named controls, visible focus, zoom allowed, labelled dialogs/switches |
| Marketing claims | PASS | Rewritten; see table above |
| Stripe: admin-only, org-bound, allowlist, unauthenticated → 401 | PASS | Probes |
| Stripe webhook rejects unsigned / forged | PASS | 400 / 400 |
| **Stripe TEST or LIVE checkout, subscription, webhook event, cancellation, payment failure** | **BLOCKED** | Supabase `STRIPE_SECRET_KEY` is a **test** key while all four price ids are **live** prices → `PRICE_UNAVAILABLE`. Production is intended to bill live (live domain, live prices). Supabase function secrets cannot be read or set from here |
| Trial / subscription enforcement | **Not enforced (business decision)** | States exist (`trial`, `active`, `past_due`, `cancelled`, set only by the webhook) and are shown in Settings; nothing blocks access. Movido's own org trial ended 2026-06-17, so enforcing now would lock it out |
| Leaked-password protection | **BLOCKED** | Off. Requires Supabase **Pro** plan (org is on Free) and the Auth dashboard; no API access here |
| Password recovery | PASS (no enumeration) / **BLOCKED** (delivery) | `/recover` returns identical `200 {}` for known and unknown emails; mail delivery needs custom SMTP (Supabase default mailer only sends to project team members) |
| Privacy policy / terms | **Missing** | No pages exist; legal text must come from the business |
| TypeScript / build / deploy | PASS | `tsc` 0 errors, `vite build` OK, Vercel production READY and serving the new bundle |

## Remaining work / needs the owner

1. **Stripe (blocks selling):** in Supabase → Edge Functions → Secrets set `STRIPE_SECRET_KEY` = your **live** secret key
   (`sk_live_…`) and `STRIPE_WEBHOOK_SECRET` = the signing secret of a **live** webhook endpoint pointing at
   `https://zjvozjnbvrtrrpehqdpf.supabase.co/functions/v1/stripe-webhook` with events `checkout.session.completed`,
   `customer.subscription.created/updated/deleted`, `invoice.paid`, `invoice.payment_failed`. Keep the four
   `STRIPE_PRICE_*` ids as they are (live). Check the annual prices match the page (£15 / £28 per vehicle per month billed annually).
   Then run one real checkout with a card and cancel/refund it. (Alternative: create test-mode prices and put test ids + a test webhook secret in Supabase and `VITE_STRIPE_PRICE_*` in Vercel.)
2. **Decide trial policy** (what happens when a trial ends or payment fails) before it is enforced.
3. **Supabase Auth:** configure custom SMTP (e.g. Resend) so sign-up and recovery emails reach customers; enable leaked-password protection (Pro plan).
4. **Legal:** publish a privacy policy and terms of service (UK GDPR: you process drivers' location data).
5. Confirm the map renders in a normal browser (dark, light, satellite).
6. Native app if background GPS is required.

## QA data left in production (isolated, safe to keep or delete)

- Organisation "QA Isolated Haulage Ltd" (`a42e18f2-…1658`): 2 vehicles, 1 driver, jobs `JOB-2026-001…004`
  and 005 (003's POD photo is a 0-byte test artifact from a harness bug), driver positions,
  geofence events, messages, incidents, fuel logs, 2 scanned documents.
- Auth users `qa-admin@qa.movidologistics.uk` (admin) and `qa-driver@qa.movidologistics.uk` (driver).
- Existing Movido data was not modified.

## Database changes (all in `supabase/migrations/`, applied to production)

010 app_settings per org · 011 private POD storage · 012 onboarding + org policies ·
013 NOT NULL integrity · 014 driver workflow · 015 per-org uniqueness · 016 driver maintenance read ·
017 driver positions · 018 server geofencing · 019 team management · 020 incidents/fuel/documents.
Edge Functions: `create-checkout-session` v12, `stripe-webhook` v6.
