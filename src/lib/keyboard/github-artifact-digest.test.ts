import { describe, expect, it } from "vite-plus/test";

import { verifyGitHubArtifactSha256Digest } from "./github-artifact-digest";

const emptyZip = new Uint8Array([
  0x50, 0x4b, 0x05, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
]);

describe("GitHub artifact digest verification", () => {
  it("verifies a GitHub SHA-256 digest over the downloaded ZIP bytes", async () => {
    await expect(
      verifyGitHubArtifactSha256Digest(
        emptyZip,
        "sha256:8739c76e681f900923b900c9df0ef75cf421d39cabb54650c4b9ad19b6a76d85",
      ),
    ).resolves.toBe("sha256:8739c76e681f900923b900c9df0ef75cf421d39cabb54650c4b9ad19b6a76d85");
  });

  it("rejects ZIP bytes that do not match the declared GitHub digest", async () => {
    const alteredZip = emptyZip.slice();
    alteredZip[4] = 0x01;

    await expect(
      verifyGitHubArtifactSha256Digest(
        alteredZip,
        "sha256:8739c76e681f900923b900c9df0ef75cf421d39cabb54650c4b9ad19b6a76d85",
      ),
    ).rejects.toThrow("GitHub artifact SHA-256 mismatch");
  });
});
