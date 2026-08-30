export interface TouchGameDeviceEnvironment {
  maxTouchPoints: number;
  coarsePointer: boolean;
  platform: string;
  userAgent: string;
}

export function detectTouchGameDevice(environment: TouchGameDeviceEnvironment): boolean {
  const userAgent = environment.userAgent;
  const platform = environment.platform;
  const isAppleMobilePlatform =
    /\b(iPad|iPhone|iPod)\b/i.test(userAgent) ||
    /\b(iPad|iPhone|iPod)\b/i.test(platform) ||
    (platform === "MacIntel" && /Mobile\//i.test(userAgent));
  const isMobilePlatform =
    isAppleMobilePlatform ||
    /Android|Windows Phone|webOS|BlackBerry|IEMobile|Opera Mini/i.test(userAgent);

  return isMobilePlatform && (environment.maxTouchPoints > 0 || environment.coarsePointer);
}
