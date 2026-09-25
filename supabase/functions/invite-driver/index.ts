// Supabase Edge Function — Invite a driver to the caller's organization.
//
// Deploy with verify_jwt = true. That only proves the JWT is valid; it says
// nothing about who the caller is or what they may do, so this function
// establishes identity itself (auth.getUser with the caller's own token) and
// authority from the database (public.users via the RPC).
//
// Nothing in the request body is ever treated as authority. The organization
// comes from the caller's profile, the driver's email from the driver record.
//
// Order of operations matters: the reversible database work happens first and
// the irreversible work (creating an auth account, sending mail) last, so a
// failure late in the flow can always be compensated.
//
// Secrets used (all Supabase/Resend defaults, never hard-coded):
//   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, RESEND_API_KEY

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const ALLOWED_ORIGINS = [
  "https://www.movidologistics.uk",
  "https://movidologistics.uk",
];

const SITE_URL = "https://www.movidologistics.uk";
const MAIL_FROM = "noreply@movidologistics.uk";
const INVITATION_TTL_DAYS = 7;

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

/** Public error codes. These are safe to return; database messages are not. */
type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "INVALID_REQUEST"
  | "DRIVER_NOT_FOUND"
  | "DRIVER_ALREADY_LINKED"
  | "ACTIVE_INVITATION_EXISTS"
  | "PLAN_LIMIT_REACHED"
  | "INVALID_DRIVER_EMAIL"
  | "INVITE_LINK_FAILED"
  | "EMAIL_NOT_SENT"
  | "SERVER_ERROR";

const PUBLIC_MESSAGE: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "Authentication required.",
  FORBIDDEN: "You are not allowed to perform this action.",
  INVALID_REQUEST: "The request body is not valid.",
  DRIVER_NOT_FOUND: "Driver not found.",
  DRIVER_ALREADY_LINKED: "This driver already has an account.",
  ACTIVE_INVITATION_EXISTS: "An invitation for this driver is already pending.",
  PLAN_LIMIT_REACHED: "Your plan's driver limit has been reached.",
  INVALID_DRIVER_EMAIL: "This driver has no valid email address.",
  INVITE_LINK_FAILED: "The invitation could not be prepared.",
  EMAIL_NOT_SENT: "The invitation was created but the email could not be sent.",
  SERVER_ERROR: "Something went wrong.",
};

/** SQLSTATEs raised by create_driver_invitation, mapped without reading messages. */
const SQLSTATE_TO_ERROR: Record<string, ErrorCode> = {
  MV403: "FORBIDDEN",
  MV404: "DRIVER_NOT_FOUND",
  MV409: "DRIVER_ALREADY_LINKED",
  MV410: "ACTIVE_INVITATION_EXISTS",
  MV411: "PLAN_LIMIT_REACHED",
  MV412: "INVALID_DRIVER_EMAIL",
  "23505": "ACTIVE_INVITATION_EXISTS",
};

const HTTP_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  INVALID_REQUEST: 400,
  DRIVER_NOT_FOUND: 404,
  DRIVER_ALREADY_LINKED: 409,
  ACTIVE_INVITATION_EXISTS: 409,
  PLAN_LIMIT_REACHED: 409,
  INVALID_DRIVER_EMAIL: 400,
  INVITE_LINK_FAILED: 502,
  EMAIL_NOT_SENT: 502,
  SERVER_ERROR: 500,
};

function json(body: unknown, status: number, cors: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function fail(
  code: ErrorCode,
  cors: Record<string, string>,
  extra?: Record<string, unknown>,
) {
  return json(
    { success: false, error: code, message: PUBLIC_MESSAGE[code], ...extra },
    HTTP_STATUS[code],
    cors,
  );
}

/** 256 bits of entropy, base64url. Never persisted, logged or returned. */
function generateToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
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

/** Structured log. Never carries the token, its hash, secrets or the address. */
function log(
  event: string,
  fields: Record<string, string | number | boolean | null>,
) {
  console.log(JSON.stringify({ fn: "invite-driver", event, ...fields }));
}

type InvitationRow = {
  invitation_id: string;
  driver_id: number;
  organization_id: string;
  email: string;
  expires_at: string;
  auth_account_exists: boolean;
};

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

  let invitationId: string | null = null;
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // 1 — Identify the caller from their own token. This client is built on the
    //     anon key on purpose: a client scoped to a user must never hold the
    //     service-role key, or a later edit that queries a table through it
    //     would silently bypass RLS. Identity comes from the request's own
    //     Authorization header and nothing else.
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

    // 2 — Parse the body. Only driver_id is accepted. organization_id and role
    //     are rejected outright rather than ignored: their presence means the
    //     client believes it can choose them, and that must surface loudly.
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
    for (const forbidden of [
      "organization_id",
      "role",
      "created_by",
      "invited_by",
      "user_id",
      "email",
      "token",
      "token_hash",
    ]) {
      if (forbidden in input) {
        log("rejected_privileged_field", { caller_id: callerId, field: forbidden });
        return fail("INVALID_REQUEST", cors);
      }
    }

    const driverId = input.driver_id;
    if (typeof driverId !== "number" || !Number.isInteger(driverId) || driverId <= 0) {
      return fail("INVALID_REQUEST", cors);
    }

    // 3 — Token first, so only its hash ever reaches the database.
    const rawToken = generateToken();
    const tokenHash = await sha256Hex(rawToken);
    const expiresAt = new Date(
      Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();

    // 4 — One transaction: authority, validation and insert. The RPC reads the
    //     driver's email itself; the value passed here is only proof that this
    //     function is working from the same record.
    const { data: driverRow, error: lookupErr } = await admin
      .from("drivers")
      .select("email, name")
      .eq("id", driverId)
      .maybeSingle();

    if (lookupErr) {
      log("driver_lookup_failed", { caller_id: callerId, driver_id: driverId });
      return fail("SERVER_ERROR", cors);
    }
    // A missing driver is indistinguishable from another organization's driver.
    // The RPC repeats this check authoritatively; this is only to build the
    // email argument.
    if (!driverRow?.email) return fail("DRIVER_NOT_FOUND", cors);

    const normalizedEmail = String(driverRow.email).trim().toLowerCase();

    const { data: rpcData, error: rpcErr } = await admin.rpc(
      "create_driver_invitation",
      {
        p_caller_id: callerId,
        p_driver_id: driverId,
        p_email: normalizedEmail,
        p_token_hash: tokenHash,
        p_expires_at: expiresAt,
      },
    );

    if (rpcErr) {
      const code = SQLSTATE_TO_ERROR[rpcErr.code ?? ""] ?? "SERVER_ERROR";
      log("rpc_rejected", {
        caller_id: callerId,
        driver_id: driverId,
        sqlstate: rpcErr.code ?? null,
        category: code,
      });
      return fail(code, cors);
    }

    const invitation = (Array.isArray(rpcData) ? rpcData[0] : rpcData) as
      | InvitationRow
      | undefined;
    if (!invitation?.invitation_id) {
      log("rpc_empty_result", { caller_id: callerId, driver_id: driverId });
      return fail("SERVER_ERROR", cors);
    }
    invitationId = invitation.invitation_id;

    log("invitation_created", {
      caller_id: callerId,
      organization_id: invitation.organization_id,
      driver_id: invitation.driver_id,
      invitation_id: invitationId,
      auth_account_exists: invitation.auth_account_exists,
    });

    // 5 — The link the driver follows. The raw token lives only here and in the
    //     email; it is never stored, logged or returned.
    const acceptUrl = `${SITE_URL}/accept-invitation?token=${encodeURIComponent(rawToken)}`;
    let inviteLink = acceptUrl;

    if (!invitation.auth_account_exists) {
      // New account: Supabase creates it and its action link lands the driver on
      // the accept page already signed in. data is cosmetic only — anything put
      // in raw_user_meta_data is client-writable later and can never be trusted.
      const { data: linkData, error: linkErr } = await admin.auth.admin
        .generateLink({
          type: "invite",
          email: invitation.email,
          options: {
            redirectTo: acceptUrl,
            data: { display_name: driverRow.name ?? null },
          },
        });

      const actionLink = linkData?.properties?.action_link;
      if (linkErr || !actionLink) {
        // Compensation: release the pending slot so the invitation can be
        // retried. The driver record is left untouched — it is real data the
        // user entered, not something this function created.
        await admin
          .from("driver_invitations")
          .update({ status: "revoked" })
          .eq("id", invitationId);

        log("invite_link_failed", {
          caller_id: callerId,
          driver_id: driverId,
          invitation_id: invitationId,
          compensated: true,
        });
        return fail("INVITE_LINK_FAILED", cors);
      }
      inviteLink = actionLink;
    }
    // Existing account: no auth call at all. The driver signs in as usual and
    // the accept page redeems the token. No second account is ever created.

    // 6 — Send. A failure here leaves the invitation pending on purpose, so the
    //     UI can resend without creating a second record.
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      log("email_skipped_no_key", {
        caller_id: callerId,
        invitation_id: invitationId,
      });
      return fail("EMAIL_NOT_SENT", cors, { invitation_id: invitationId });
    }

    const mailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: invitation.email,
        subject: "Your Movido driver account",
        html:
          `<p>Hello${driverRow.name ? ` ${driverRow.name}` : ""},</p>` +
          `<p>You have been invited to the Movido driver app. ` +
          `Use the link below to set up your account. It expires in ${INVITATION_TTL_DAYS} days.</p>` +
          `<p><a href="${inviteLink}">Set up my account</a></p>` +
          `<p>If you were not expecting this, you can ignore this email.</p>`,
      }),
    });

    if (!mailRes.ok) {
      log("email_failed", {
        caller_id: callerId,
        invitation_id: invitationId,
        status: mailRes.status,
      });
      return fail("EMAIL_NOT_SENT", cors, { invitation_id: invitationId });
    }

    log("invitation_sent", {
      caller_id: callerId,
      organization_id: invitation.organization_id,
      driver_id: invitation.driver_id,
      invitation_id: invitationId,
      status: "pending",
    });

    return json(
      {
        success: true,
        invitation_id: invitation.invitation_id,
        driver_id: invitation.driver_id,
        expires_at: invitation.expires_at,
      },
      201,
      cors,
    );
  } catch (err) {
    // Never let a raw error reach the client: it carries table, column and
    // constraint names.
    log("unhandled", {
      invitation_id: invitationId,
      category: err instanceof Error ? err.name : "unknown",
    });
    return fail("SERVER_ERROR", cors);
  }
});
