const FALLBACK = "/dashboard";
const PROBE_ORIGIN = "http://pfos.invalid";

/**
 * Returns `value` only if it is a same-origin relative path, otherwise `/dashboard`.
 * Browsers read `\` as `/`, so `/\evil.com` would leave the site; resolving it against a
 * probe origin with the WHATWG URL parser catches that and any other cross-origin form.
 */
export function safeRedirectPath(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/")) return FALLBACK;
  try {
    const url = new URL(value, PROBE_ORIGIN);
    if (url.origin !== PROBE_ORIGIN) return FALLBACK;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return FALLBACK;
  }
}
