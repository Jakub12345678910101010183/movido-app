/**
 * A photo sent from the MOViDO Driver app. Photos live in the private
 * `driver-uploads` bucket; storage policies let office users of the same
 * company read them, so they are shown through short-lived signed URLs.
 * Older rows that stored a full URL are shown as-is.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

export function useDriverPhotoUrl(path: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!path) { setUrl(null); return; }
    if (/^https?:\/\//.test(path)) { setUrl(path); return; }
    let alive = true;
    void supabase.storage.from("driver-uploads").createSignedUrl(path, 300)
      .then(({ data }) => { if (alive) setUrl(data?.signedUrl ?? null); });
    return () => { alive = false; };
  }, [path]);
  return url;
}

export function DriverPhoto({ path, alt, className }: { path: string; alt: string; className?: string }) {
  const url = useDriverPhotoUrl(path);
  if (!url) return <div className={`${className ?? ""} flex items-center justify-center text-xs text-muted-foreground bg-muted/30`}>Loading photo…</div>;
  return (
    <a href={url} target="_blank" rel="noreferrer">
      <img src={url} alt={alt} className={className} />
    </a>
  );
}

export function DriverPhotoLink({ path, label }: { path: string; label: string }) {
  const url = useDriverPhotoUrl(path);
  if (!url) return <span className="text-xs text-muted-foreground">{label}</span>;
  return <a href={url} target="_blank" rel="noreferrer" className="text-xs text-primary hover:underline">{label}</a>;
}
