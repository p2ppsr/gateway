/**
 * @file utils/scriptOrigin.ts
 * @description
 * Provides helpers to reliably detect the origin (scheme + host + port) of the
 * loaded `pay.js` script at runtime. This ensures that all relative API calls
 * (e.g. `/invoice`, `/getStatus`) are resolved against the same host that
 * delivered the script, avoiding CORS and mixed-origin handshake issues.
 *
 * @author xAI
 * @date 2025-09-15
 * @version 1.0
 * @changelog
 * - 2025-09-15 (v1.0): Initial extraction from discussions around PayButton
 *   injection and handshake mismatches.
 */

let _scriptOrigin: string | null = null;

/**
 * Returns the origin of the currently loaded `pay.js` script.
 *
 * - Scans `<script>` tags for one whose `src` ends with `/pay.js`.
 * - Extracts and caches its `.origin` (scheme://host:port).
 * - Falls back to `window.location.origin` if no match is found.
 * - Safe to call multiple times; caches the result.
 *
 * @function getScriptOrigin
 * @returns {string} The origin string.
 * @example
 * const base = getScriptOrigin()
 * const url = `${base}/api/getStatus`
 */

/**
 * Detects the origin (protocol + host + port) of the loaded `pay.js` script.
 * Falls back to `window.location.origin` if the script tag is not found.
 *
 * @returns {string} The origin string.
 */
export function getScriptOrigin(): string {
  if (_scriptOrigin) {
    console.log("cached origin returned", { origin: _scriptOrigin });
    return _scriptOrigin;
  }

  if (typeof window === "undefined") {
    _scriptOrigin = "";
    console.log("server-side execution, returning empty string");
    return _scriptOrigin;
  }

  const scripts = window.document.getElementsByTagName("script");
  for (const s of Array.from(scripts)) {
    const src = s.getAttribute("src") || "";
    if (src.endsWith("/pay.js")) {
      try {
        const url = new URL(src, window.location.origin);
        _scriptOrigin = url.origin;
        console.log("detected pay.js script origin", {
          src,
          origin: _scriptOrigin,
        });
        return _scriptOrigin;
      } catch (err) {
        console.log("URL parse error for pay.js script", {
          src,
          error: String(err),
        });
      }
    }
  }

  // fallback
  _scriptOrigin = window.location.origin;
  console.log("fallback to window.location.origin", { origin: _scriptOrigin });
  return _scriptOrigin;
}
