/**
 * Singleton routing name for the QMK USB-index Durable Object.
 *
 * Kept in its own dependency-free module so request-path code can reference the
 * name without importing the agent class (which pulls in `cloudflare:workers`
 * and would break the Node SSR/prerender build).
 */
export const QMK_INDEX_AGENT_NAME = "qmk-usb-index";
