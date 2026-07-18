export interface WorkflowRetryDelayInput {
  ctx: {
    attempt: number;
  };
  error: Error;
}

export interface WorkflowRetryDelayOptions {
  baseDelayMs: number;
  maxDelayMs: number;
}

const retryAfterPattern = /retry-after(?:\s*[:=]\s*|\s+)(\d+)/i;

/**
 * Cloudflare Workflows' current dynamic-delay API. The platform persists the
 * retry and calls this function with the durable attempt number and failure.
 * A provider Retry-After hint wins; otherwise attempts use bounded
 * exponential spacing while the Workflow remains the single execution path.
 */
export function workflowRetryDelay(options: WorkflowRetryDelayOptions) {
  return ({ ctx, error }: WorkflowRetryDelayInput): number => {
    const retryAfterSeconds = Number(retryAfterPattern.exec(error.message)?.[1]);
    if (Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0) {
      return Math.min(options.maxDelayMs, retryAfterSeconds * 1_000);
    }

    const rateLimited = /(?:rate.?limit|\b429\b)/i.test(error.message);
    const baseDelayMs = rateLimited ? Math.max(options.baseDelayMs, 30_000) : options.baseDelayMs;
    const exponent = Math.max(0, Math.min(ctx.attempt - 1, 12));
    return Math.min(options.maxDelayMs, baseDelayMs * 2 ** exponent);
  };
}
