import { describe, expect, it } from "vite-plus/test";

import { generateFirmwareArtifacts } from "$lib/keyboard/firmware-source";
import { starterBoardProfile } from "$lib/keyboard/sample-boards";

import {
  createFirmwareGithubSyncInput,
  firmwareGithubBranchLabel,
  firmwareGithubVariantInput,
} from "./firmware-github-actions";

describe("firmware GitHub app actions", () => {
  it("creates the shared sync payload for a kbui firmware branch", () => {
    const profile = starterBoardProfile();
    const generated = generateFirmwareArtifacts(profile);
    const variant = firmwareGithubVariantInput({
      id: "variant-abc",
      name: "Gaming",
      sourceSavePointId: "sp-123",
    });

    const input = createFirmwareGithubSyncInput({ generated, profile, variant });

    expect(firmwareGithubBranchLabel(profile, variant)).toBe(
      "kbui/local-keyboard-profile/variant-abc",
    );
    expect(input.private).toBe(true);
    expect(input.variant).toEqual({
      id: "variant-abc",
      name: "Gaming",
      sourceSavePointId: "sp-123",
    });
    expect(input.source.sourceHash).toBe(generated.sourceHash);
    expect(input.source.files.map((file) => file.path)).toContain("qmk/keymap.json");
  });
});
