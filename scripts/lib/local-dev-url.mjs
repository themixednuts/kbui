import { readFileSync } from "node:fs";
import { createServer } from "node:net";
import { resolve } from "node:path";

export function readDotenvValue(name, filePath = ".dev.vars") {
  let text;
  try {
    text = readFileSync(filePath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") return null;
    throw error;
  }

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const separator = line.indexOf("=");
    if (separator === -1) continue;

    const key = line.slice(0, separator).trim();
    if (key !== name) continue;

    let value = line.slice(separator + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote)) {
      value = value.slice(1, -1);
    }
    return value.trim() || null;
  }

  return null;
}

export function findLocalDevUrl({
  cwd = process.cwd(),
  env = process.env,
  envNames = ["KBGUI_WORKER_URL", "KBGUI_WORKER_DEV_URL", "BETTER_AUTH_URL"],
  fileNames = [".dev.vars"],
  valueName = "BETTER_AUTH_URL",
} = {}) {
  for (const name of envNames) {
    const value = env[name]?.trim();
    if (value) return { value, source: `environment ${name}` };
  }

  for (const fileName of fileNames) {
    const filePath = resolve(cwd, fileName);
    const value = readDotenvValue(valueName, filePath);
    if (value) return { value, source: fileName };
  }

  return null;
}

export function parseLocalDevUrl(value, source = "configuration") {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error(`${source} must be a valid http(s) URL, got ${JSON.stringify(value)}.`);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error(`${source} must use http or https, got ${url.protocol}.`);
  }

  const port = Number(url.port || (url.protocol === "https:" ? 443 : 80));
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`${source} must include a valid port.`);
  }

  return {
    bindHost: bindHostFor(url.hostname),
    hostname: url.hostname,
    origin: url.origin,
    port,
    protocol: url.protocol.slice(0, -1),
    url,
  };
}

export function quoteShellArg(value) {
  if (/^[\w./:=@-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

export async function assertPortAvailable(host, port) {
  await new Promise((resolvePromise, reject) => {
    const server = createServer();
    server.once("error", (error) => {
      reject(error);
    });
    server.once("listening", () => {
      server.close(resolvePromise);
    });
    server.listen(port, host);
  });
}

function bindHostFor(hostname) {
  const withoutIpv6Brackets = hostname.replace(/^\[(.*)\]$/, "$1");
  return withoutIpv6Brackets === "localhost" ? "127.0.0.1" : withoutIpv6Brackets;
}
