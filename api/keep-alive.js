export default async function handler(req, res) {
    try {
          const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
          const supabaseKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;

      if (!supabaseUrl || !supabaseKey) {
              return res.status(500).json({ ok: false, error: 'Missing Supabase env vars' });
      }

      const response = await fetch(`${supabaseUrl}/rest/v1/`, {
              headers: {
                        apikey: supabaseKey,
                        Authorization: `Bearer ${supabaseKey}`,
              },
      });

      res.status(200).json({
              ok: true,
              supabase_status: response.status,
              pinged_at: new Date().toISOString(),
      });
    } catch (error) {
          res.status(500).json({ ok: false, error: error.message });
    }
}
