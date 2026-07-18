import { Effect, Schema } from "effect";

import { platformError } from "$lib/effect/errors";
import { selfHeal } from "$lib/effect/self-healing";
import { runWorkerEffect } from "$lib/effect/worker-runtime";
import type { RequestHandler } from "./$types";

import {
  parseGitHubWorkflowRunWebhook,
  verifyGitHubWebhookSignature,
} from "$lib/server/github/webhook";

export const POST: RequestHandler = ({ platform, request }) => {
  const env = platform?.env;
  if (
    !env?.AuthAgent ||
    !env.FirmwareBuildAgent ||
    !env.GITHUB_FIRMWARE_EVENTS ||
    !env.GITHUB_WEBHOOK_SECRET
  ) {
    return Response.json({ message: "GitHub webhooks are not configured." }, { status: 503 });
  }

  const eventName = request.headers.get("x-github-event");
  if (eventName !== "workflow_run") return new Response(null, { status: 202 });

  const deliveryId = request.headers.get("x-github-delivery")?.trim();
  if (!deliveryId) {
    return Response.json({ message: "GitHub delivery id is required." }, { status: 400 });
  }

  return runWorkerEffect(
    "api.webhooks.github",
    Effect.gen(function* () {
      const body = yield* Effect.tryPromise({
        try: () => request.arrayBuffer(),
        catch: (cause) => platformError("github-webhook.read-body", cause),
      });
      const verified = yield* Effect.tryPromise({
        try: () =>
          verifyGitHubWebhookSignature(
            body,
            request.headers.get("x-hub-signature-256"),
            env.GITHUB_WEBHOOK_SECRET,
          ),
        catch: (cause) => platformError("github-webhook.verify-signature", cause),
      });
      if (!verified) {
        return Response.json({ message: "Invalid webhook signature." }, { status: 401 });
      }

      const decoded = yield* Schema.decodeUnknownEffect(Schema.UnknownFromJsonString)(
        new TextDecoder().decode(body),
      ).pipe(Effect.result);
      if (decoded._tag === "Failure") {
        return Response.json({ message: "Invalid workflow_run payload." }, { status: 400 });
      }
      const event = yield* Effect.try({
        try: () => parseGitHubWorkflowRunWebhook(decoded.success),
        catch: (cause) => platformError("github-webhook.decode-workflow-run", cause),
      }).pipe(Effect.result);
      if (event._tag === "Failure") {
        return Response.json({ message: "Invalid workflow_run payload." }, { status: 400 });
      }

      // Acknowledge GitHub only after Cloudflare Queues confirms the signed event is durable.
      yield* selfHeal(
        Effect.tryPromise({
          try: () =>
            env.GITHUB_FIRMWARE_EVENTS.send({
              deliveryId,
              event: event.success,
              receivedAt: new Date().toISOString(),
            }),
          catch: (cause) => platformError("github-webhook.enqueue", cause),
        }),
        "1 second",
      );
      return new Response(null, { status: 202 });
    }),
  );
};
