import { Schema } from "effect";

const workflowRunSchema = Schema.Struct({
  id: Schema.Number,
  run_number: Schema.Number,
  name: Schema.NullOr(Schema.String),
  display_title: Schema.String,
  event: Schema.String,
  status: Schema.NullOr(Schema.String),
  conclusion: Schema.NullOr(Schema.String),
  head_branch: Schema.NullOr(Schema.String),
  head_sha: Schema.String,
  html_url: Schema.String,
  created_at: Schema.String,
  updated_at: Schema.String,
  run_started_at: Schema.optionalKey(Schema.NullOr(Schema.String)),
});

const workflowRunWebhookSchema = Schema.Struct({
  action: Schema.String,
  installation: Schema.Struct({ id: Schema.Number }),
  repository: Schema.Struct({
    id: Schema.Number,
    name: Schema.String,
    full_name: Schema.String,
    owner: Schema.Struct({ login: Schema.String }),
  }),
  workflow_run: workflowRunSchema,
});

export interface GitHubWorkflowRunWebhookEvent {
  action: string;
  installationId: string;
  repository: {
    fullName: string;
    id: string;
    name: string;
    owner: string;
  };
  run: {
    conclusion: string | null;
    createdAt: string;
    displayTitle: string;
    event: string;
    headBranch: string | null;
    headSha: string;
    htmlUrl: string;
    id: string;
    name: string | null;
    runNumber: number;
    startedAt: string | null;
    status: string | null;
    updatedAt: string;
  };
}

export function parseGitHubWorkflowRunWebhook(value: unknown): GitHubWorkflowRunWebhookEvent {
  const payload = Schema.decodeUnknownSync(workflowRunWebhookSchema)(value);
  return {
    action: payload.action,
    installationId: String(payload.installation.id),
    repository: {
      fullName: payload.repository.full_name,
      id: String(payload.repository.id),
      name: payload.repository.name,
      owner: payload.repository.owner.login,
    },
    run: {
      conclusion: payload.workflow_run.conclusion,
      createdAt: payload.workflow_run.created_at,
      displayTitle: payload.workflow_run.display_title,
      event: payload.workflow_run.event,
      headBranch: payload.workflow_run.head_branch,
      headSha: payload.workflow_run.head_sha,
      htmlUrl: payload.workflow_run.html_url,
      id: String(payload.workflow_run.id),
      name: payload.workflow_run.name,
      runNumber: payload.workflow_run.run_number,
      startedAt: payload.workflow_run.run_started_at ?? null,
      status: payload.workflow_run.status,
      updatedAt: payload.workflow_run.updated_at,
    },
  };
}

export async function verifyGitHubWebhookSignature(
  body: ArrayBuffer,
  signatureHeader: string | null,
  secret: string,
): Promise<boolean> {
  const signature = signatureBytes(signatureHeader);
  if (!signature || !secret) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { hash: "SHA-256", name: "HMAC" },
    false,
    ["verify"],
  );
  return crypto.subtle.verify("HMAC", key, arrayBufferCopy(signature), body);
}

function signatureBytes(value: string | null): Uint8Array | null {
  if (!value?.startsWith("sha256=")) return null;
  const hex = value.slice("sha256=".length);
  if (!/^[0-9a-f]{64}$/i.test(hex)) return null;

  const bytes = new Uint8Array(hex.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function arrayBufferCopy(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}
