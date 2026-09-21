// Supabase Edge Function — Redeem a driver invitation.
//
// Counterpart of invite-driver. Deploy with verify_jwt = true.
//
// This function exists because accept_driver_invitation is granted to
// service_role only. That is deliberate: the RPC takes the caller's id as an
// argument, so any role that could call it directly could pass someone else's
// id and bind that person's driver record. The browser therefore never touches
// the RPC — it posts its token here, and this function supplies the caller id
// from a token it verified itself.
//
// The raw token is received over TLS, hashed here, and never stored, logged or
// returned. The client is not asked to hash it: a hash sent from the browser
// would be exactly as sensitive as the token itself, with no benefit.
//
// Secrets used (all Supabase defaults, never hard-coded):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const ALLOWED_ORIGINS = [
  "https://www.movidologistics.uk",
  "https://movidologistics.uk",
];

function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("Origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin)
      ? origin
      : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type",
    "Vary": "Origin",
  };
}

/**
 * Pulls the bearer token out of the Authorization header.
 *
 * The token has to be handed to auth.getUser() explicitly: this client is
 * created with persistSession false and so has no session of its own, and the
 * supabase-js version pinned above resolves getUser()'s JWT from that session
 * rather than from an injected Authorization header. Called with no argument it
 * therefore fails locally, without ever asking the auth server — which is a
 * rejection of our own making, not of the token.
 *
 * The return value is a credential. It is passed straight to getUser() and is
 * never logged, stored or returned.
 */
function readBearerToken(req: Request): string | null {
  const header = req.headers.get("Authorization") ?? "";
  const [scheme, ...rest] = header.split(" ");
  if (scheme.toLowerCase() !== "bearer") return null;
  const token = rest.join(" ").trim();
  return token.length > 0 ? token : null;
}

type ErrorCode =
  | "UNAUTHENTICATED"
  | "INVALID_REQUEST"
  | "INVITATION_NOT_REDEEMABLE"
  | "EMAIL_MISMATCH"
  | "DRIVER_ALREADY_BOUND"
  | "SERVER_ERROR";

const PUBLIC_MESSAGE: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "Authentication required.",
  INVALID_REQUEST: "The request is not valid.",
  INVITATION_NOT_REDEEMABLE: "Invitation link is invalid or expired.",
  EMAIL_MISMATCH: "This invitation does not belong to this account.",
  DRIVER_ALREADY_BOUND: "This driver already has an account.",
  SERVER_ERROR: "Your invitation could not be completed.",
};

const HTTP_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  INVALID_REQUEST: 400,
  INVITATION_NOT_REDEEMABLE: 400,
  EMAIL_MISMATCH: 403,
  DRIVER_ALREADY_BOUND: 409,
  SERVER_ERROR: 500,
};

/** SQLSTATEs raised by accept_driver_invitation, mapped without reading messages. */
const SQLSTATE_TO_ERROR: Record<string, ErrorCode> = {
  MV400: "INVALID_REQUEST",
  MV401: "UNAUTHENTICATED",
  MV403: "EMAIL_MISMATCH",
  MV404: "INVITATION_NOT_REDEEMABLE",
  MV409: "DRIVER_ALREADY_BOUND",
};

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function fail(code: ErrorCode, cors: Record<string, string>) {
  return json(
    { success: false, error: code, message: PUBLIC_MESSAGE[code] },
    HTTP_STATUS[code],
    cors,
  );
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Structured log. Never carries the token, its hash or any secret. */
function log(
  event: string,
  fields: Record<string, string | number | boolean | null>,
) {
  console.log(JSON.stringify({ fn: "accept-invitation", event, ...fields }));
}

type AcceptedRow = { driver_id: number; organization_id: string };

Deno.serve(async (req: Request) => {
  const cors = getCorsHeaders(req);

  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return fail("INVALID_REQUEST", cors);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    log("misconfigured", {
      has_url: Boolean(supabaseUrl),
      has_service_key: Boolean(serviceRoleKey),
      has_anon_key: Boolean(anonKey),
    });
    return fail("SERVER_ERROR", cors);
  }

  try {
    // 1 — Identity, from the caller's own token. Built on the anon key so this
    //     client can never reach past what the caller is allowed to see.
    const accessToken = readBearerToken(req);
    if (!accessToken) {
      return fail("UNAUTHENTICATED", cors);
    }

    const caller = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });

    // The token is passed explicitly, so getUser() verifies it against the auth
    // server instead of looking for a session this client does not have.
    const { data: userData, error: userErr } = await caller.auth.getUser(
      accessToken,
    );
    const callerId = userData?.user?.id;
    if (userErr || !callerId) {
      log("unauthenticated", { reason: userErr ? "token_rejected" : "no_user" });
      return fail("UNAUTHENTICATED", cors);
    }

    // 2 — Only a token is accepted. driver_id, organization_id and role are not
    //     inputs at all; they come from the invitation row inside the RPC.
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return fail("INVALID_REQUEST", cors);
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return fail("INVALID_REQUEST", cors);
    }

    const input = body as Record<string, unknown>;
    for (
      const forbidden of [
        "driver_id",
        "organization_id",
        "role",
        "user_id",
        "caller_id",
        "email",
        "token_hash",
      ]
    ) {
      if (forbidden in input) {
        log("rejected_privileged_field", { caller_id: callerId, field: forbidden });
        return fail("INVALID_REQUEST", cors);
      }
    }

    const token = input.token;
    if (typeof token !== "string" || token.length < 32 || token.length > 512) {
      return fail("INVALID_REQUEST", cors);
    }

    // 3 — Hash here, so the browser never holds a credential-equivalent digest.
    const tokenHash = await sha256Hex(token);

    // 4 — One transactional RPC: consume, bind, promote.
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: rpcData, error: rpcErr } = await admin.rpc(
      "accept_driver_invitation",
      { p_caller_id: callerId, p_token_hash: tokenHash },
    );

    if (rpcErr) {
      const code = SQLSTATE_TO_ERROR[rpcErr.code ?? ""] ?? "SERVER_ERROR";
      log("rpc_rejected", {
        caller_id: callerId,
        sqlstate: rpcErr.code ?? null,
        category: code,
      });
      return fail(code, cors);
    }

    const accepted = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as
      | AcceptedRow
      | undefined;
    if (!accepted?.driver_id) {
      log("rpc_empty_result", { caller_id: callerId });
      return fail("SERVER_ERROR", cors);
    }

    log("invitation_accepted", {
      caller_id: callerId,
      driver_id: accepted.driver_id,
      organization_id: accepted.organization_id,
    });

    // The driver id is the caller's own record; the organization is not
    // disclosed, since the client has no use for it here.
    return json({ success: true, driver_id: accepted.driver_id }, 200, cors);
  } catch (err) {
    log("unhandled", {
      category: err instanceof Error ? err.name : "unknown",
    });
    return fail("SERVER_ERROR", cors);
  }
});
