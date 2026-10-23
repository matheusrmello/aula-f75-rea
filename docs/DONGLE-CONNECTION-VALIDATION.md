# Dongle connection validation — 2026-10-22

The installed Flatpak `com.aula.f75controller` was tested against the connected
`3554:FA09` Compx 2.4 GHz receiver on the local Linux desktop.

## Failure and correction

Both receiver hidraw nodes were owned by root with no read/write access for the
active desktop user. The Flatpak already had `devices=all` and read-only udev
access, so its sandbox permissions could not solve the host permission failure.

After explicit user approval, `scripts/install-udev.sh` installed
`/etc/udev/rules.d/70-aula-f75.rules`, reloaded udev, and triggered change events
only on the connected AULA devices. The rule grants `uaccess` to the active local
desktop session for `258A:010C` and `3554:FA09` only. Its position before
`73-seat-late.rules` is required for the session ACL to be applied.

## Observed results

- The active user gained read/write access to both receiver hidraw nodes.
- The installed Flatpak successfully opened and closed those nodes.
- The actual packaged app loaded `aula://app/` as a secure context with WebHID.
- `navigator.hid.getDevices()` returned `2.4G Wireless Receiver`, VID `3554`,
  PID `FA09`, with output report `0x13` on vendor usage page `0xFF02`.
- WebHID successfully opened and closed that receiver interface inside the
  installed Flatpak.

The diagnostic used a separate temporary Chromium profile and was terminated
after validation. It sent no HID reports and did not capture keyboard input.
Lighting, radio configuration persistence, and remapping were not tested by
this connection check.

## Desktop 1.0.1: connection button and USB cable

The subsequent immediate `No device selected` failure had a second cause:
Electron called the HID permission check with `aula://app/`, while the app
compared it with the literal `aula://app`. The request was denied before the
device chooser event. This was reproduced in a separate installed Flatpak
instance; accepting the equivalent application origin allowed the request.

Version 1.0.1 validates the URL's scheme and host, restricts grants to the two
supported VID/PID pairs and the app origin, reuses already permitted devices,
rejects interfaces without the transport's configuration report, and adds
explicit Auto / USB-C / Dongle choices. Auto prefers USB when both are present.

The system Flatpak was updated from the local 1.0.1 bundle after native Linux
administrator authentication. Installed commit:
`6bb2a7f2a32e538225dc49b26ab176568aa37a8cd158ce1118e1358a2f1e7ab4`.

Verified in the installed package on 2026-10-22:

- Clicking Connect in Auto and USB-C modes opened `258A:010C`.
- A USB configuration read returned a valid `06 84 00 00 01 00 80 00` header
  and 128 bytes of configuration (136 bytes total). No persistent setting was
  changed.
- Clicking Connect in Dongle mode opened `3554:FA09`.
- Native `navigator.hid.requestDevice()` completed successfully for each
  transport, testing the original origin-check failure directly.
- Disconnect/reconnect and the transport selector worked through the UI.
- Four desktop policy tests and 67 web unit tests passed. The production web
  build, TypeScript checking, and AppStream metadata validation passed.

Machine-readable results are in `connection-1.0.1-results.json`; the screenshot
`flatpak-1.0.1-usb-connected.png` records the rendered USB connection. The
diagnostic process used an isolated profile and was terminated. The user's old
app instance was then replaced by a normal launch of the updated Flatpak.

These checks establish USB configuration communication and access to the
receiver. Wireless lighting/settings persistence and remapping were not tested;
the keyboard was connected by cable during this validation.
