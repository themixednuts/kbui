import type {
  GitHubFirmwareProfileTargetInput,
  GitHubFirmwareSyncInput,
  GitHubFirmwareVariantInput,
} from "$lib/github-app/types";
import { generateFirmwareArtifacts, type FirmwareArtifacts } from "$lib/keyboard/firmware-source";
import {
  firmwareGitHubBranchForVariant,
  firmwareGitHubVariantForProfile,
} from "$lib/keyboard/firmware-github";
import type { DeviceProfile } from "$lib/keyboard/schema";

export type AuthClientError = {
  code?: string;
  message?: string;
  status?: number;
  statusText?: string;
};

export interface FirmwareGithubSyncInputOptions {
  generated?: FirmwareArtifacts;
  private?: boolean;
  profile: DeviceProfile;
  repositoryName?: string;
  variant: GitHubFirmwareVariantInput;
}

export function createFirmwareGithubSyncInput({
  generated,
  private: privateRepository = true,
  profile,
  repositoryName,
  variant,
}: FirmwareGithubSyncInputOptions): GitHubFirmwareSyncInput {
  const artifacts = generated ?? generateFirmwareArtifacts(profile);
  return {
    private: privateRepository,
    profile: firmwareGithubProfileTarget(profile),
    repositoryName,
    source: {
      buildCommand: artifacts.buildCommand,
      diagnostics: artifacts.diagnostics,
      files: artifacts.artifacts.map((file) => ({
        content: file.content,
        mimeType: file.mimeType,
        path: file.path,
        role: file.role,
      })),
      sourceHash: artifacts.sourceHash,
    },
    variant,
  };
}

export function firmwareGithubProfileTarget(
  profile: DeviceProfile,
): GitHubFirmwareProfileTargetInput {
  return profileTarget(profile);
}

function profileTarget(profile: DeviceProfile): GitHubFirmwareProfileTargetInput {
  return profile as unknown as GitHubFirmwareProfileTargetInput;
}

export function firmwareGithubVariantInput(input: {
  id: string;
  name?: string;
  sourceSavePointId?: string | null;
}): GitHubFirmwareVariantInput {
  return {
    id: input.id,
    name: input.name,
    sourceSavePointId: input.sourceSavePointId ?? undefined,
  };
}

export function firmwareGithubBranchLabel(
  profile: DeviceProfile,
  variant: GitHubFirmwareVariantInput,
) {
  return firmwareGitHubBranchForVariant(
    firmwareGitHubVariantForProfile(profileTarget(profile), variant),
  );
}

export function authClientErrorMessage(error: unknown, fallback: string) {
  if (typeof error === "object" && error !== null) {
    const candidate = error as AuthClientError;
    if (candidate.message) return candidate.message;
    if (candidate.statusText)
      return `${candidate.status}${candidate.status ? " " : ""}${candidate.statusText}`;
    if (candidate.code) return candidate.code;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}
