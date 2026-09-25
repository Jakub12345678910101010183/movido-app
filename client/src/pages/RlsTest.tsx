/**
 * RlsTest — TEMPORARY diagnostic page. Delete before merge.
 *
 * Runs six read-only checks against the tables a driver must not see past, using
 * the ordinary supabase client and whatever session the browser already holds.
 * There is no bespoke auth here and no token handling of any kind: the client
 * attaches the session itself, exactly as every other page does.
 *
 * Every query is a SELECT. Five of the six ask for a count with head: true, so
 * no row ever leaves the database. The one query that reads a value takes a
 * single integer id, needed to phrase "not mine" in checks 4 and 5, and that id
 * is never rendered.
 *
 * The page renders pass/fail and a count. No names, addresses, emails, ids or
 * tokens appear on screen or in the console.
 */

import { useEffect, useState } from "react";
import { Link } from "wouter";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { ShieldCheck, Loader2, Check, X, ArrowLeft } from "lucide-react";

type Result = {
  name: string;
  pass: boolean;
  detail: string;
  expectation: string;
};

/** Counts matching rows without fetching any of them. */
async function countOnly(
  table: "drivers" | "jobs" | "vehicles",
  apply: (q: any) => any,
): Promise<{ count: number | null; code: string | null }> {
  const { count, error } = await apply(
    supabase.from(table).select("id", { count: "exact", head: true }),
  );
  if (error) return { count: null, code: error.code ?? "error" };
  return { count: count ?? 0, code: null };
}

export default function RlsTest() {
  const [results, setResults] = useState<Result[] | null>(null);

  useEffect(() => {
    let active = true;

    void (async () => {
      const out: Result[] = [];
      const detail = (r: { count: number | null; code: string | null }) =>
        r.count === null ? `blocked (${r.code})` : `${r.count} record(s)`;

      // 1 — own driver record. Also the positive control: if this comes back
      //     empty, the session or the role binding is wrong, not RLS.
      const ownRow = await supabase.from("drivers").select("id").limit(2);
      const ownIds = (ownRow.data ?? []) as { id: number }[];
      out.push({
        name: "1 — own drivers record",
        pass: !ownRow.error && ownIds.length === 1,
        detail: ownRow.error
          ? `blocked (${ownRow.error.code ?? "error"})`
          : `${ownIds.length} record(s)`,
        expectation: "exactly 1",
      });
      const ownDriverId = ownIds.length === 1 ? ownIds[0].id : null;

      // 2 — own jobs. Any count is correct; what matters is that the query is
      //     allowed at all and scoped by RLS.
      const t2 = await countOnly("jobs", (q) => q);
      out.push({
        name: "2 — own jobs",
        pass: t2.count !== null,
        detail: detail(t2),
        expectation: "readable, scoped to this driver",
      });

      // 3 — the assigned vehicle, and nothing else.
      const t3 = await countOnly("vehicles", (q) => q);
      out.push({
        name: "3 — assigned vehicle only",
        pass: t3.count !== null && t3.count <= 1,
        detail: detail(t3),
        expectation: "0 or 1",
      });

      // 4 — somebody else's driver record.
      if (ownDriverId === null) {
        out.push({
          name: "4 — other drivers blocked",
          pass: false,
          detail: "skipped — check 1 returned no record",
          expectation: "0",
        });
      } else {
        const t4 = await countOnly("drivers", (q) => q.neq("id", ownDriverId));
        out.push({
          name: "4 — other drivers blocked",
          pass: t4.count === 0 || t4.count === null,
          detail: detail(t4),
          expectation: "0",
        });
      }

      // 5 — jobs assigned to somebody else.
      if (ownDriverId === null) {
        out.push({
          name: "5 — other drivers' jobs blocked",
          pass: false,
          detail: "skipped — check 1 returned no record",
          expectation: "0",
        });
      } else {
        const t5 = await countOnly("jobs", (q) => q.neq("driver_id", ownDriverId));
        out.push({
          name: "5 — other drivers' jobs blocked",
          pass: t5.count === 0 || t5.count === null,
          detail: detail(t5),
          expectation: "0",
        });
      }

      // 6 — the rest of the fleet: vehicles with nobody assigned.
      const t6 = await countOnly("vehicles", (q) => q.is("driver_id", null));
      out.push({
        name: "6 — unassigned vehicles blocked",
        pass: t6.count === 0 || t6.count === null,
        detail: detail(t6),
        expectation: "0",
      });

      if (active) setResults(out);
    })();

    return () => {
      active = false;
    };
  }, []);

  const passed = results?.filter((r) => r.pass).length ?? 0;
  const total = results?.length ?? 0;

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center space-y-2">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-primary/10 border border-primary/30 flex items-center justify-center">
            <ShieldCheck className="w-7 h-7 text-primary" />
          </div>
          <h1 className="text-xl font-bold">RLS read-only check</h1>
          <p className="text-xs text-muted-foreground">
            Temporary diagnostic page. Six SELECT queries, no writes, nothing
            identifying shown.
          </p>
        </div>

        {results === null ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <Loader2 className="w-7 h-7 text-primary animate-spin" />
            <span className="text-sm text-muted-foreground">Running checks…</span>
          </div>
        ) : (
          <>
            <div className="rounded-lg border border-border divide-y divide-border overflow-hidden">
              {results.map((r) => (
                <div key={r.name} className="flex items-start gap-3 p-3">
                  <span
                    className={`mt-0.5 w-5 h-5 shrink-0 rounded-full flex items-center justify-center ${
                      r.pass ? "bg-primary/15 text-primary" : "bg-destructive/15 text-destructive"
                    }`}
                  >
                    {r.pass ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}
                  </span>
                  <div className="min-w-0 space-y-0.5">
                    <p className="text-sm font-medium">
                      <span className={r.pass ? "text-primary" : "text-destructive"}>
                        {r.pass ? "PASS" : "FAIL"}
                      </span>{" "}
                      {r.name}
                    </p>
                    <p className="text-xs text-muted-foreground font-mono">
                      {r.detail} · expected {r.expectation}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            <p
              className={`text-center text-sm font-medium ${
                passed === total ? "text-primary" : "text-destructive"
              }`}
            >
              {passed} / {total} passed
            </p>
          </>
        )}

        <Link href="/">
          <Button variant="outline" className="w-full gap-2">
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
        </Link>
      </div>
    </div>
  );
}
