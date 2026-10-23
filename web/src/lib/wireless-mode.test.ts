import { describe, expect, it } from 'vitest';
import { buildWirelessFrames, buildWirelessIdleFrame, isWirelessDevice, sendWirelessAnimationFrame } from './wireless-mode';
import { WIRELESS_PID, WIRELESS_VID } from './protocol';

function frameChecksum(frame: Uint8Array) {
  return frame.slice(0, 19).reduce((sum, byte) => sum + byte, 0) & 0xff;
}

describe('2.4 GHz dongle transport', () => {
  it('recognizes the receiver VID/PID', () => {
    expect(isWirelessDevice({ vendorId: WIRELESS_VID, productId: WIRELESS_PID } as HIDDevice)).toBe(true);
    expect(isWirelessDevice({ vendorId: WIRELESS_VID, productId: 0x010c } as HIDDevice)).toBe(false);
  });

  it('builds a checksummed idle output report', () => {
    const frame = buildWirelessIdleFrame();
    expect(frame).toHaveLength(20);
    expect([...frame.slice(0, 5)]).toEqual([0x13, 0x88, 0x01, 0x00, 0x23]);
    expect(frame[19]).toBe(frameChecksum(frame));
  });

  it('groups equal colors into receiver frames with a valid checksum', () => {
    const colors = new Map([[3, [64, 128, 192] as [number, number, number]], [7, [64, 128, 192] as [number, number, number]]]);
    const [frame] = buildWirelessFrames(colors);
    expect(frame).toHaveLength(20);
    expect([...frame.slice(0, 11)]).toEqual([0x13, 0x88, 1, 0, 0x16, 64, 128, 192, 2, 3, 7]);
    expect(frame[19]).toBe(frameChecksum(frame));
  });

  it('strips the report id when sending through WebHID', async () => {
    const sent: { reportId: number; data: Uint8Array }[] = [];
    const device = {
      vendorId: WIRELESS_VID,
      productId: WIRELESS_PID,
      sendReport: async (reportId: number, data: BufferSource) => {
        sent.push({ reportId, data: new Uint8Array(data as ArrayBuffer) });
      },
    } as unknown as HIDDevice;

    await sendWirelessAnimationFrame(device, new Map([[1, [255, 0, 0] as [number, number, number]]]));
    expect(sent).toHaveLength(1);
    expect(sent[0].reportId).toBe(0x13);
    expect(sent[0].data).toHaveLength(19);
  });
});
