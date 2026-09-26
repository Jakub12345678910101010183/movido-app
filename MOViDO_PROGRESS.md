# MOViDO — Production Readiness Progress

Last updated: 2026-09-26 · Deployed to production from `main` (PRs #7, #8 — pre-sale hardening)
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

### Pre-sale hardening (PRs #7, #8, migration 021)
| Issue | Fix | Verified |
|---|---|---|
| **Open mail relay**: `send-verification-email` sent any address any link from `noreply@movidologistics.uk` using only the public anon key; nothing in the app used it | Retired (returns 410), unused client helper removed | PASS (production call → 410) |
| **Tracking-link privacy**: a delivered job's link kept showing the driver's live position on later jobs; full driver name shown | Driver first name only; position only while that job is in progress; tokens < 32 chars rejected | PASS (DB probe + production page) |
| **Driver "Delete" was a fake success**: no delete policy, UI said "Driver removed", driver reappeared | Deletable only with no jobs and no login; clear refusal message otherwise | PASS (production: refused with message, still listed) |
| Deleting a driver cascaded away their fuel records | Fuel logs kept (driver set to NULL) | PASS (probe) |
| Deleting a completed job destroyed the POD evidence and orphaned the photo in storage | Jobs with photo/signature cannot be deleted | PASS (probe) |
| Refused deletes surfaced raw database errors | Every refusal explained (vehicles, drivers, jobs) | PASS |
| **Sign-out failed silently offline**: device stayed signed in when the logout request failed | Local session always cleared | PASS (logout request forced to fail → signed out) |
| No Privacy Policy / Terms | `/privacy`, `/terms` (drafts with OWNER TO CONFIRM placeholders), linked from footer, sign-up and company creation | PASS (pages live) — **legal review required** |
| Trial state invisible to customers | Banner: days left / ended / payment failed / cancelled, plans link for admins; no lockout; `lib/subscription.ts` documents where enforcement must go (database) | PASS (new company shows "Free trial: 14 days left") |
| Annual price displayed rounded (£15 instead of £15.20) | Exact figure + "20% off the monthly price" | PASS (code) |
| Production error screen showed stack traces | Hidden in production, structured console line | PASS (code) |
| 404 in light theme; canonical/structured data on the redirecting bare domain, claiming iOS/Android apps and AI; robots allowed tracking links | Themed 404; `www` canonical/sitemap; accurate JSON-LD; robots blocks `/track/`, `/driver`, auth pages | PASS (production) |

## PASS / FAIL / BLOCKED / OWNER ACTION

| Area | Status | Evidence |
|---|---|---|
| **New customer journey (production)**: landing → sign-up → email confirmation requested → company created → 14-day trial banner → add vehicle → add driver → job with 2 stops assigned → tracking link → Reports CSV → Pricing | PASS | New company "QA Journey 453159 Ltd"; email confirmation step done in DB for the test address (no mailbox) |
| Driver workspace → GPS → deliver → POD → dispatch map → POD view | PASS | Production run on QA company (JOB-2026-005); the new company's driver could not accept an invitation without a mailbox |
| Account lifecycle: pending → added by admin → access → disabled (refresh blocked; API returns 0 rows with old token) → re-enabled → sign out/in | PASS | Production, two browsers |
| Customers | N/A | No separate customer records: the customer is captured on each job |
| RLS / RBAC / organisation isolation / anon | PASS | Rolled-back probes (previous pass + 021 probes) |
| Tracking links | PASS | 128-bit random tokens, invalid/short rejected, first name only, no phone/email, position only while in progress, correct status |
| File uploads | PASS | Private buckets; POD 10 MB (jpeg/png/webp/heic), documents 20 MB (jpeg/png/webp/tiff); org-folder policies; random object names; signed URLs |
| Abuse surfaces | PASS / OWNER ACTION | Open relay closed; invitations limited to one pending per driver and only to the driver's stored email; checkout admin-only; GPS history ≤ 1 row / 10 s per driver; login/sign-up/recovery rely on Supabase Auth rate limits (review values in Auth → Rate Limits) |
| Recovery email | PASS (no enumeration) / **BLOCKED** (delivery) | Identical response for known/unknown emails; Supabase records confirmation emails as sent, but delivery could not be observed (no mailbox) |
| Driver invitation email | **BLOCKED** | Needs a real mailbox; failure path shows "created but email could not be sent" |
| Error observability | PASS (basic) | Edge Function, Postgres, API and Auth logs in Supabase; Vercel runtime logs; no alerting configured |
| Production bundle secrets | PASS | Only the anon key; no `sk_`, `whsec_` or service-role key; price ids match the server allowlist |
| HTTPS / headers | PASS | HSTS, X-Frame-Options DENY, nosniff, strict referrer policy; bare/.com domains redirect to www |
| **Stripe checkout / subscription / webhook events** | **BLOCKED** | Test secret key with live price ids → "Online checkout is temporarily unavailable"; annual price amounts in Stripe not visible from here |
| Trial enforcement | **OWNER ACTION** | Not enforced by design until the policy is decided |
| Backups | **BLOCKED / OWNER ACTION** | Supabase organisation is on the Free plan: no downloadable daily backups or PITR. Verify in Dashboard → Database → Backups; Pro plan gives daily backups |
| Leaked-password protection | **BLOCKED** | Pro plan + dashboard |
| Privacy Policy / Terms | **OWNER ACTION (legal review)** | Drafts live with placeholders |
| TomTom key restrictions | **OWNER ACTION** | Key is public in the browser by design; restrict it to `movidologistics.uk` domains in the TomTom developer portal |
| Map visuals | **BLOCKED** (headless) | Styles load without errors; check once in a normal browser |
| Background GPS | **BLOCKED (platform)** | Browser limitation, disclosed |

## Remaining work / needs the owner

1. **Stripe (blocks selling):** set live `STRIPE_SECRET_KEY` and live `STRIPE_WEBHOOK_SECRET` in Supabase function secrets; live webhook to
   `https://zjvozjnbvrtrrpehqdpf.supabase.co/functions/v1/stripe-webhook` (events: checkout.session.completed,
   customer.subscription.created/updated/deleted, invoice.paid, invoice.payment_failed). Confirm the live annual prices are
   £182.40 (Starter) and £336 (Professional) per vehicle per year — the page shows 20% off monthly. Run one real checkout, then cancel/refund.
2. **Legal:** complete every "OWNER TO CONFIRM" in `/privacy` and `/terms` (company number, address, retention periods, VAT,
   cancellation/refunds, liability, governing law, ICO registration) and have them reviewed.
3. **Trial policy:** decide what happens after the trial / failed payment; then enforce in the database.
4. **Supabase:** move to Pro for backups and leaked-password protection; confirm SMTP (sender domain, SPF/DKIM) by signing up with a real mailbox;
   check Auth rate limits and that Site URL / redirect URLs use `https://www.movidologistics.uk`.
5. **TomTom:** restrict the API key to your domains.
6. **Deletion policy:** decide retention for driver location history, POD and jobs, and how a customer's company is removed on request
   (there is no self-service company deletion; it is done by us on request).
7. Optional: error alerting (Supabase log alerts or a monitoring service).

## QA data cleanup plan (not executed)

Test data lives only in isolated companies; none of it is visible to other companies:
- "QA Isolated Haulage Ltd" (`a42e18f2-…1658`) and "QA Journey 453159 Ltd" (`c09b89e6-…220c`), their users
  (`qa-admin@`, `qa-driver@`, `qa-journey-453159@`, `qa-journey-staff-453159@qa.movidologistics.uk`), jobs, positions, events,
  messages, incidents, fuel logs, documents and files under `<org id>/` in the `pod-photos` and `documents` buckets.
- Two empty companies from early sign-ups, "dispatch Logistics" and "driver Logistics" (no users, no data).

To remove, in one transaction as the service role: delete `incidents` and `fuel_logs` whose driver belongs to those companies;
delete `storage.objects` in both buckets whose name starts with each company id; delete the `organizations` rows (cascades to
jobs, drivers, vehicles, positions, events, messages, documents); delete the four `auth.users` above (their `public.users` rows
go with them). Keep the Movido Logistics Ltd company untouched.

## QA data left in production (isolated, safe to keep or delete)

See the cleanup plan above. The two journey test accounts had their e-mail confirmed directly in the database
(data-only migrations `qa_confirm_journey_test_account`, `qa_confirm_journey_staff_account`) because no mailbox exists for
`qa.movidologistics.uk`. Existing Movido Logistics Ltd data was not modified.

## Database changes (all in `supabase/migrations/`, applied to production)

010 app_settings per org · 011 private POD storage · 012 onboarding + org policies ·
013 NOT NULL integrity · 014 driver workflow · 015 per-org uniqueness · 016 driver maintenance read ·
017 driver positions · 018 server geofencing · 019 team management · 020 incidents/fuel/documents ·
021 pre-launch safety (tracking privacy, guarded deletes).
Edge Functions: `create-checkout-session` v12, `stripe-webhook` v6, `send-verification-email` retired (v3, 410).
