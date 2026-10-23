# AULA F75 Controller for Linux

A Linux desktop app that configures the AULA F75 mechanical keyboard over WebHID. AULA only ships a Windows driver; this speaks the keyboard's own config protocol directly from Chromium, so no background service runs as root. Device traffic stays on your machine.

Wired, it can do most of what the official driver does:

| Feature                                 | Status                                                         | Where                |
| --------------------------------------- | -------------------------------------------------------------- | -------------------- |
| RGB effect switching, speed, brightness | wired + 2.4 GHz dongle                                          | Effects              |
| Per-key colors                          | wired color table; dongle output protocol                      | Per-Key              |
| Live animations                         | wired + 2.4 GHz dongle                                          | Animations           |
| Key remapping, Default + FN1 layers     | wired; dongle keybind protocol not confirmed                   | Remap                |
| Debounce, sleep timer, device info      | wired + dongle settings frames                                  | Settings             |
| Keybind profiles                        | wired only                                                      | Settings             |
| Macro recording                         | keyboard upload not figured out yet; macros are stored locally | Macros               |

The 2.4 GHz receiver has protocol support for lighting effects, settings, per-key output, and live animations. Key remapping and keybind profiles require USB-C because a dongle keybind protocol has not been confirmed. Opening the physical receiver through WebHID in Flatpak has been verified; individual wireless configuration commands still require hardware validation.

## Installable Linux app

Build AppImage and Flatpak packages from the repository root:

```bash
npm install
npm run dist:portable
```

Packages are written to `dist/`. To build just one format, use `npm run dist:appimage` or `npm run dist:flatpak`. Debian packages remain available through `npm run dist:deb`. The desktop app uses Electron/Chromium and the existing WebHID interface. Choose **Auto (USB first)**, **USB-C cable**, or **Dongle 2.4 GHz** beside Connect. Auto prefers the cable when both devices are present; explicit choices never fall back to the other transport. Only interfaces with the correct configuration report are accepted.

The Flatpak build needs Python 3 and Flatpak. It downloads Electron2.BaseApp 26.08 into this checkout's ignored `.build/flatpak/` directory and bundles Zypak for Electron's process sandbox. It repackages the built Electron app without requiring `flatpak-builder` or downloading the full SDK. The installed app uses the Freedesktop Platform 26.08 runtime.

Install the local Flatpak bundle and run it:

```bash
flatpak install --user ./dist/AULA-F75-Controller-1.0.2-x86_64.flatpak
flatpak run com.aula.f75controller
```

The Flatpak grants `--device=all` because Chromium WebHID opens `/dev/hidraw`, which is not covered by Flatpak's raw USB portal. `/run/udev` is exposed read-only for HID enumeration. The app itself accepts only `258A:010C` and `3554:FA09`. It has no host home-directory access; network access preserves the existing font loading. Host udev permissions are still required for HID access in either package format.

Linux may require a udev permission rule before the app can open the HID device. The bundled rule is limited to the F75 and receiver IDs and grants access to the active desktop user. To install it manually:

```bash
sh scripts/install-udev.sh
```

The helper requests administrator authentication, installs only the two AULA VID/PID rules, reloads udev and refreshes the currently connected AULA HID interfaces. The rule must be named `70-aula-f75.rules` so it runs before `73-seat-late.rules`, which grants access to the active local session. Flatpak device permissions do not override the host's hidraw permissions. The package build does not install this host rule.

## Setup

For browser development, use a Chromium-based browser (Chrome, Edge, Brave) and [Bun](https://bun.sh) or Node 18+. Then give your user access to the keyboard's hidraw node using the rule described above:

```bash
sh scripts/install-udev.sh
```

Unplug and reconnect the keyboard or receiver after installing this session-scoped rule.

Run it:

```bash
cd web
bun install
bun dev
```

Open http://localhost:3000 and click **Connect keyboard**. Chromium asks which device to share when access has not been granted. Pick the vendor interface with feature report `0x06` for USB or output report `0x13` for the dongle. The app rejects a plain keyboard interface and reuses previously granted devices on subsequent connections. The desktop package grants access only to the two supported AULA IDs.

Production build:

```bash
bun run build
bun start
```

## If something doesn't work

Click **Save trace** above the console first — it downloads a `.trace` file with your browser info, device state, and everything the app logged. Attach it when opening an issue and diagnosis gets much faster.

Things we've run into, in roughly the order people hit them:

- **The keyboard isn't in the chooser at all.** Check `journalctl -k`. No `258a:010c` line means the OS doesn't see it: try a port on the computer itself rather than a hub (we watched a flaky hub eat half a day), make sure the side switch is set to Wired, and remember the cable matters.
- **"Failed to open" on connect.** The udev rule isn't loaded (replug after installing it), or another tab/app is holding the keyboard — WebHID allows one claimant at a time. Close other tabs, including old ones.
- **Connect immediately says "No device selected" in desktop version 1.0.0.** Update to 1.0.1, which fixes the Electron HID origin check (`aula://app/` versus `aula://app`).
- **Lights went haywire from experimenting.** Hold Fn+Esc for ~5 seconds: that's the keyboard's built-in factory reset and it recovers from almost anything, wireless modes included. Macros → _Snapshot defaults_ before heavy tinkering gives you a one-click undo.
- **Wired suddenly won't enumerate but 2.4G still types.** The MCU is fine; it's sitting in a wireless state. Flip the side switch to Wired, replug, and if needed do the Fn+Esc reset.

## How it works

Two protocols live inside this keyboard, selected by USB product ID:

- Wired (`258A:010C`) uses 520-byte feature reports with id `0x06`. A 128-byte config region holds the current-effect byte (offset 10), a debounce value, and a table of per-effect brightness/speed/color slots starting at offset 64. Writes apply live — no save command observed.
- The dongle (`3554:FA09`) uses 20-byte output reports (id `0x13`) for configuration, lighting, and grouped per-key animation frames.

We found the current-effect offset by snapshotting the config region while pressing the keyboard's own knob and diffing the reads — no writes involved. There's a button for this under Macros (_Probe select, read-only_) if you want to reproduce it on yours.

Full wire details, offsets, and framing are documented in [docs/PROTOCOL.md](docs/PROTOCOL.md).

## Development

```bash
cd web
bun test            # unit tests (protocol, layout, keybind, profiles, ...)
bunx tsc --noEmit   # typecheck
```

From the repository root, `npm run test:desktop` checks the desktop HID permission policy, including Electron's origin with a trailing slash.

The Remap diagram uses `web/src/data/f75-keymap.json`, generated with
`node tools/gen-keymap.mjs`. OEM `[KEY]` coordinates are left/top/right/bottom;
the generator converts the last two coordinates into actual width/height.
Version 1.0.2 fixes overlapping keycaps and makes labels share each key's click
target, with keyboard focus and Enter/Space selection.

The protocol layer is separated from React: `web/src/lib/f75.ts` is the transport, `f75-layout.ts` maps config bytes to meaning, and `webhid.ts` dispatches per connection type. Layout constants that came from hardware experiments are marked as such in comments.

## Credits

This stands on prior reverse-engineering work — thank you:

- https://github.com/marcoslor/Aula-F87-Controller —
  web app structure and the lighting wire protocol
- https://github.com/vndarkblue/aula-keybind (MIT) —
  keybind wire format and factory templates (used as test fixtures)
- https://github.com/veysiemrah/aula-rgb-controller —
  cross-checking of the lighting protocol
- The OEM `KB.ini` from AULA's Windows driver — ground truth for the key
  matrix; see `assets/oem/PROVENANCE.md`

## Known limitations

- Macros never leave the app: the keyboard's macro-write frames haven't been
  captured, so recordings are stored in local profiles awaiting that work.
- F1–F12 can't be remapped; those firmware slots are pinned.
- Key remapping over the 2.4 GHz dongle is not confirmed; use USB-C for remapping and keybind profiles.
- Sleep timer is informational on wired mode — the OEM driver hides it there
  too (`KB.ini` `ShowPower=0`).
- Profiles capture keybind layers only; lighting isn't saved into profiles.

> **AI usage:** AI was heavily used throughout this codebase, primarily through OpenCode with GLM-5.3-Flash, for implementation, debugging, and code exploration.
