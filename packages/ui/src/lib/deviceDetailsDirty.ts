import type { DeviceDetailsTabId } from './deviceDetailsTabs.ts';

/**
 * True when leaving the active draft tab would discard unsaved edits.
 * Inactive tabs are unmounted, so only the active tab's dirty flag matters.
 */
export function shouldBlockDeviceDetailsTabLeave(args: {
  activeTab: DeviceDetailsTabId;
  nextTab: DeviceDetailsTabId;
  cameraDirty: boolean;
  recognitionDirty: boolean;
  settingsDirty: boolean;
}): boolean {
  if (args.activeTab === args.nextTab) return false;

  switch (args.activeTab) {
    case 'camera':
      return args.cameraDirty;
    case 'recognition':
      return args.recognitionDirty;
    case 'settings':
      return args.settingsDirty;
    default:
      return false;
  }
}
