import { WIRED_PID, WIRED_VID, WIRELESS_PID, WIRELESS_VID } from "./protocol";

export type Connection = "wired" | "wireless" | "unknown";
export type ConnectionChoice = "auto" | "wired" | "wireless";

export function parseConfigFrames(config: (Uint8Array | null)[]): number {
  return config.filter((c) => c !== null).length;
}

export function connectionLabel(pid: number): Connection {
  if (pid === WIRED_PID) return "wired";
  if (pid === WIRELESS_PID) return "wireless";
  return "unknown";
}

export function hasExpectedTransportReport(device: Pick<HIDDevice, "vendorId" | "productId" | "collections">): boolean {
  const wireless = device.vendorId === WIRELESS_VID && device.productId === WIRELESS_PID;
  const wired = device.vendorId === WIRED_VID && device.productId === WIRED_PID;
  if (!wireless && !wired) return false;
  const matches = (collection: HIDCollectionInfo): boolean => (wireless
    ? (collection.outputReports ?? []).some((report) => report.reportId === 0x13)
    : (collection.featureReports ?? []).some((report) => report.reportId === 0x06))
    || (collection.children ?? []).some(matches);
  return device.collections.some(matches);
}

export function selectKeyboard(devices: HIDDevice[], choice: ConnectionChoice): HIDDevice | undefined {
  const candidates = devices.filter(hasExpectedTransportReport);
  if (choice === "wireless") return candidates.find(d => d.vendorId === WIRELESS_VID && d.productId === WIRELESS_PID);
  const wired = candidates.find(d => d.vendorId === WIRED_VID && d.productId === WIRED_PID);
  return choice === "wired" ? wired : wired ?? candidates[0];
}
