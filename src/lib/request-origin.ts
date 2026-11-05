function originOf(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).origin;
  } catch {
    return undefined;
  }
}

// PUBLIC_ORIGIN is the browser-facing URL when a TLS reverse proxy forwards to plain HTTP.
export function hasSameOrigin(request: Request, publicOrigin = process.env.PUBLIC_ORIGIN): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return true;
  if (origin !== "null" && origin === originOf(publicOrigin)) return true;

  const requestUrl = new URL(request.url);
  const host = request.headers.get("host");
  // Next.js can use an internal hostname in request.url; Host retains the browser's destination.
  const expectedOrigin = host
    ? new URL(`${requestUrl.protocol}//${host}`).origin
    : requestUrl.origin;

  return origin === expectedOrigin;
}
