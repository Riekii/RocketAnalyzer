export function hasSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (origin === null) return true;

  const requestUrl = new URL(request.url);
  const host = request.headers.get("host");
  // Next.js can use an internal hostname in request.url; Host retains the browser's destination.
  const expectedOrigin = host
    ? new URL(`${requestUrl.protocol}//${host}`).origin
    : requestUrl.origin;

  return origin === expectedOrigin;
}
