import type { FirmwareBuildRequest, FirmwareBuildResult } from "./types";

export const firmwareBuildUnavailableMessage =
  "in-browser WASM build not yet available — download source and build with `qmk compile`";

export interface FirmwareBuilder {
  build(request: FirmwareBuildRequest): Promise<FirmwareBuildResult>;
}

export class FirmwareBuildUnavailableError extends Error {
  readonly code = "browser_build_unavailable";

  constructor(message = firmwareBuildUnavailableMessage) {
    super(message);
    this.name = "FirmwareBuildUnavailableError";
  }
}

export class NotImplementedFirmwareBuilder implements FirmwareBuilder {
  async build(_request: FirmwareBuildRequest): Promise<FirmwareBuildResult> {
    throw new FirmwareBuildUnavailableError();
  }
}

export function isBrowserBuildAvailable(): false {
  return false;
}
