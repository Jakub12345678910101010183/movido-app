# Pending: location-aware stop actions, Stage 2

Nothing in this folder is a migration yet. `supabase db push` only reads
`supabase/migrations`, so these files are never applied by accident.

| File | Purpose |
|---|---|
| `20260928200000_stop_location_enforce.sql` | Stage 2: enforce the location rule in `driver_confirm_stop`, remove `driver_mark_stop(4 args)` and `driver_update_stop`, POD time limit 12 h |
| `stop_location_enforce_test.sql` | Stage 2 location rule tests (46) |
| `driver_stop_state_machine_stage2_test.sql` | Phase 2A tests ported to `driver_confirm_stop` (replaces `tests/driver_stop_state_machine.sql` at Stage 2) |

## Rollout

1. **Stage 1 migration** `supabase/migrations/20260928191000_stop_location_compat.sql`
   (adds `driver_confirm_stop` + `driver_stop_location_check`; changes nothing existing).
   Verify read-only: only those two functions added, all existing function
   hashes unchanged, grants (drivers can call `driver_confirm_stop`, nobody but
   the server can call `driver_stop_location_check`), data fingerprints unchanged.
2. **Web deploy**: merge movido-app to main (Vercel). The Web Driver then calls
   `driver_confirm_stop` with a browser fix. Smoke: Driver page, Office pages.
3. **EAS build** of movido-driver (calls `driver_confirm_stop` with the fix taken
   at the tap; uploads GPS before the action queue).
4. **Install and test** the new native build on a real device (QA driver).
5. **Real production flow, QA tenant only**: one disposable QA job with
   geocoded stops; Arrive and Delivered at the stops from the new native app and
   the Web Driver; confirm on the job's stops that `arrived_location_check` /
   `completed_location_check` are `ok` with sensible `*_distance_m` and
   `*_accuracy_m`. Also confirm no production driver still uses an old build
   (old builds call `driver_mark_stop`; Stage 2 removes it).
6. **Stage 2 migration** (only after 1–5 are verified and approved): move
   `20260928200000_stop_location_enforce.sql` into `supabase/migrations`
   unchanged (same SHA-256), apply it alone, replace
   `tests/driver_stop_state_machine.sql` and `tests/stop_location_compat.sql`
   with the Stage 2 tests here, verify read-only.

Until Stage 2, stop actions are recorded with their location result but not
refused; the old entry points keep today's behaviour.

# Pending: F1 geofence next-stop arrival

| File | Purpose |
|---|---|
| `20261001120000_geofence_next_stop_arrival.sql` | `evaluate_geofences` only: a stop reached before the previous one was delivered arrives on the next fresh qualifying point once it is next (point time >= previous delivery), with location evidence |
| `20261001120500_geofence_next_stop_arrival_rollback.sql` | Restores the production `evaluate_geofences` (hash `1edabe6e`) |
| `geofence_next_stop_arrival_test.sql` | F1 tests (27) |
