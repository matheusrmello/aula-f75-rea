import { describe, expect, it } from "vitest";
import { WIRED_PID, WIRELESS_PID } from "./protocol";
import { connectionLabel, hasExpectedTransportReport, parseConfigFrames, selectKeyboard } from "./deviceinfo";

describe("deviceinfo", () => {
  it("counts the config frames that were read", () => {
    const cfg = new Array<(Uint8Array | null)>(10).fill(null);
    cfg[3] = new Uint8Array(19);
    cfg[7] = new Uint8Array(19);
    expect(parseConfigFrames(cfg)).toBe(2);
  });
  it("reports 0 frames when nothing was read", () => {
    expect(parseConfigFrames(new Array(10).fill(null))).toBe(0);
  });
  it("labels the connection from the product ID", () => {
    expect(connectionLabel(WIRED_PID)).toBe("wired");
    expect(connectionLabel(WIRELESS_PID)).toBe("wireless");
    expect(connectionLabel(0x0000)).toBe("unknown");
  });
  it("checks the dongle output report separately from the wired feature report", () => {
    const dongle = {
      vendorId: 0x3554,
      productId: 0xfa09,
      collections: [{ outputReports: [{ reportId: 0x13 }], featureReports: [] }],
    } as unknown as HIDDevice;
    const wired = {
      vendorId: 0x258a,
      productId: 0x010c,
      collections: [{ outputReports: [], featureReports: [{ reportId: 0x06 }] }],
    } as unknown as HIDDevice;
    expect(hasExpectedTransportReport(dongle)).toBe(true);
    expect(hasExpectedTransportReport(wired)).toBe(true);
    expect(hasExpectedTransportReport({ ...dongle, collections: [{ outputReports: [], featureReports: [{ reportId: 0x06 }] }] } as unknown as HIDDevice)).toBe(false);
  });
  it("prefers USB automatically and respects explicit transport choices", () => {
    const wired = { vendorId: 0x258a, productId: 0x010c, collections: [{ featureReports: [{ reportId: 6 }] }] } as unknown as HIDDevice;
    const dongle = { vendorId: 0x3554, productId: 0xfa09, collections: [{ outputReports: [{ reportId: 19 }] }] } as unknown as HIDDevice;
    const plain = { ...wired, collections: [] };
    expect(selectKeyboard([plain, dongle, wired], "auto")).toBe(wired);
    expect(selectKeyboard([wired, dongle], "wireless")).toBe(dongle);
    expect(selectKeyboard([wired, dongle], "wired")).toBe(wired);
    expect(selectKeyboard([dongle], "auto")).toBe(dongle);
    expect(selectKeyboard([dongle], "wired")).toBeUndefined();
    expect(selectKeyboard([plain], "auto")).toBeUndefined();
  });
  it("rejects unrelated devices even if they share a report ID", () => {
    expect(hasExpectedTransportReport({ vendorId: 1, productId: 2, collections: [{ featureReports: [{ reportId: 6 }] }] } as unknown as HIDDevice)).toBe(false);
  });
  it("finds configuration reports in nested collections", () => {
    expect(hasExpectedTransportReport({ vendorId: 0x258a, productId: 0x010c, collections: [{ children: [{ featureReports: [{ reportId: 6 }] }] }] } as unknown as HIDDevice)).toBe(true);
  });
});
