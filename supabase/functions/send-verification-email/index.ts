// Supabase Edge Function — retired.
//
// This endpoint used to send an e-mail to any address with any link taken
// from the request body. Because the public anon key is enough to call it,
// that made it an open mail relay for phishing from our domain. Nothing in
// the app uses it (sign-up confirmation and password recovery are sent by
// Supabase Auth; driver invitations by `invite-driver`), so it now refuses
// every request.

Deno.serve(() =>
  new Response(JSON.stringify({ error: "GONE" }), {
    status: 410,
    headers: { "Content-Type": "application/json" },
  })
);
