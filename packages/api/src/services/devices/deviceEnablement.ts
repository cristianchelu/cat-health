/**
 * Both switches must be on: a disabled account is never initialized, so it has
 * no manager to hand out controllers and its devices are as unreachable as one
 * switched off directly. The columns stay separate so the UI can say which.
 */
export function isDeviceReachable(device: {
  enabled: number | boolean;
  account_enabled: number | boolean;
}): boolean {
  return Boolean(device.enabled) && Boolean(device.account_enabled);
}
