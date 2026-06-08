import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export interface AppSettings {
  diesel_price_per_litre: number;
  hgv_litres_per_mile: number;
}

const DEFAULTS: AppSettings = {
  diesel_price_per_litre: 1.85,
  hgv_litres_per_mile: 0.57,
};

export function useAppSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchSettings() {
      try {
        const { data, error } = await supabase
          .from("app_settings")
          .select("key, value");

        if (error || !data) {
          console.warn("app_settings not found, using defaults:", error?.message);
          return;
        }

        const parsed: Partial<AppSettings> = {};
        for (const row of data) {
          if (row.key in DEFAULTS) {
            (parsed as Record<string, number>)[row.key] = parseFloat(row.value);
          }
        }

        setSettings({ ...DEFAULTS, ...parsed });
      } catch (err) {
        console.warn("Failed to load app settings, using defaults");
      } finally {
        setLoading(false);
      }
    }

    fetchSettings();
  }, []);

  return { settings, loading };
}
