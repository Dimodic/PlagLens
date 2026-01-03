/**
 * Minimal HTML sanitizer for trusted-but-external content (e.g. problem
 * statements rendered by Yandex.Contest).
 *
 * NOT a full DOMPurify replacement. We rely on the fact that:
 *   - the HTML comes from a single closed source we control by integration
 *     (YC's `/contests/{id}/problems/{id}` endpoint),
 *   - it's rendered behind a tenant-scoped auth,
 *   - we don't need to defend against motivated attackers.
 *
 * What we strip:
 *   - `<script>` / `<style>` / `<iframe>` / `<object>` / `<embed>` blocks
 *   - `on*` event-handler attributes (onclick, onerror, …)
 *   - `javascript:` URLs in href/src
 *   - `data:` URLs in href/src that aren't images
 *
 * Everything else (img, table, p, ul/ol, code, pre, math, …) is passed
 * through so problem statements render with their original formatting.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return '';
  let out = html;
  // Block-level dangerous tags — kill the entire element + content.
  out = out.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '');
  out = out.replace(/<style\b[\s\S]*?<\/style\s*>/gi, '');
  out = out.replace(/<iframe\b[\s\S]*?<\/iframe\s*>/gi, '');
  out = out.replace(/<object\b[\s\S]*?<\/object\s*>/gi, '');
  out = out.replace(/<embed\b[^>]*>/gi, '');
  // Inline event handlers — `onload="..."`, `onclick='...'`, `onerror=foo`.
  out = out.replace(/\son\w+\s*=\s*"[^"]*"/gi, '');
  out = out.replace(/\son\w+\s*=\s*'[^']*'/gi, '');
  out = out.replace(/\son\w+\s*=\s*[^\s>]+/gi, '');
  // javascript: URLs in href/src — replace the scheme with `about:blank`
  // so the surrounding markup keeps its structure.
  out = out.replace(/(href|src)\s*=\s*"javascript:[^"]*"/gi, '$1="about:blank"');
  out = out.replace(/(href|src)\s*=\s*'javascript:[^']*'/gi, "$1='about:blank'");
  // data: URLs anywhere other than <img> are suspicious — drop them.
  out = out.replace(/(href)\s*=\s*"data:[^"]*"/gi, '$1="about:blank"');
  out = out.replace(/(href)\s*=\s*'data:[^']*'/gi, "$1='about:blank'");
  return out;
}
