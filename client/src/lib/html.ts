/**
 * Escape text for insertion into HTML strings. Map markers and popups are
 * built as HTML, and names, addresses and references are user-entered.
 */
export function escapeHtml(text: string | number | null | undefined): string {
  return String(text ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] ?? c,
  );
}
