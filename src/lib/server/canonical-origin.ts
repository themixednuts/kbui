export function canonicalLoopbackUrl(
  requestUrl: URL,
  configuredBaseUrl: string | undefined,
): URL | null {
  const configuredUrl = parseHttpUrl(configuredBaseUrl);
  if (!configuredUrl || requestUrl.origin === configuredUrl.origin) return null;
  if (!sameLoopbackTarget(requestUrl, configuredUrl)) return null;

  const redirectUrl = new URL(requestUrl);
  redirectUrl.protocol = configuredUrl.protocol;
  redirectUrl.hostname = configuredUrl.hostname;
  redirectUrl.port = configuredUrl.port;
  return redirectUrl;
}

function sameLoopbackTarget(left: URL, right: URL) {
  return (
    left.protocol === right.protocol &&
    urlPort(left) === urlPort(right) &&
    isLoopbackHost(left.hostname) &&
    isLoopbackHost(right.hostname)
  );
}

function parseHttpUrl(value: string | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function urlPort(url: URL) {
  return url.port || (url.protocol === "https:" ? "443" : "80");
}

function isLoopbackHost(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[(.*)\]$/, "$1");
  return normalized === "localhost" || normalized === "127.0.0.1" || normalized === "::1";
}
