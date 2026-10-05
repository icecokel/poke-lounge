export class RequiredGameAssetError extends Error {
  constructor(
    readonly resourcePath: string,
    readonly reason: "HTTP" | "NETWORK" | "INVALID_JSON" | "INVALID_DATA" | "IMAGE",
    readonly status?: number,
  ) {
    super(`Required game asset failed: ${reason}`);
    this.name = "RequiredGameAssetError";
  }
}
