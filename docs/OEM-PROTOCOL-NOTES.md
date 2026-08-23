# OemDrv.exe (AULA F75 / "CDevG5KB") — HID feature-report call-site analysis

Read-only RE notes. All addresses are VAs (ImageBase 0x400000). Disasm: `/tmp/opencode/oem/asm.txt`
(objdump intel, --no-show-raw-insn). Import thunks: `jmp [ds:0x5d01fc]` @0x5b95a4 = HidD_SetFeature,
`jmp [ds:0x5d0200]` @0x5b95aa = HidD_GetFeature (HID.DLL IAT).

Vendor class names from rdata strings: `CDevG5KB`, log tags `ServiceThread_G5`,
`CDevG5KB::AccessData`, `CDevG5KB::AccessData_Page`. Strings are ASCII, code paths confirmed by
adjacent `push <str>` before a printf-like at `ds:0x649470`.

---

## 1. Every SetFeature/GetFeature call site

| # | Line | VA | Call | Containing function | Role |
|---|------|----|------|---------------------|------|
| 1 | 168062 | 0x487937 | Set | 0x4878f0 | generic Send wrapper (retry ×3, Sleep 200 ms) |
| 2 | 168121 | 0x4879bc | Get | 0x487980 | generic Get wrapper (retry ×3, Sleep 200 ms) |
| 3 | 168184/168206 | 0x487a69 / 0x487ab2 | S+G | 0x487a10 | **GetPassword** ("GetPassword: Send/GET Err") |
| 4 | 168279 | 0x487b8a | Set | 0x487b10 | write 254-byte block id 0xB6 |
| 5 | 168328/168348 | 0x487c15 / 0x487c5e | S+G | 0x487bb0 | read block id 0xB6 (resp checked ==0x83) |
| 6 | 168411 | 0x487d2f | Set | 0x487ca0 | write 1024 B, op 0x09 + idx, addr bytes `00 40 00 00` |
| 7 | 168475 | 0x487df1 | Set | 0x487d60 | write 1024 B, op 0x04, region D4 @ `00 40 00 00` |
| 8 | 168533/168553 | 0x487e85 / 0x487ece | S+G | 0x487e20 | read 1024 B, op 0x84, region D4 |
| 9 | 178382/178440 etc. | 0x48f520 / 0x48f60c | S+G | ~0x48f3b0 | chunked write+verify engine **with additive checksum**, forced prefix 0x09 |
| ... | (family of 9 near-identical pair sites 173239–174516 inside engines) | | | 0x48b350 / 0x48b5d0 | generic 520-B chunked write / read engines |
| 10 | 177283 | 0x48e71f | Set | 0x48e530 | **AccessData_Page**: paged 512-B stream, header cmd 0x0C |
| 11 | 168835 | 0x48822a | Set (direct) | 0x4881b0 | **SendMusicData** (music-sync stream), 382-B frame |
| 12 | 178673–180031 | 0x48f673..0x490b21 pairs | S+G | wrappers around 0x48f3b0 | 5 AccessData callers, cmds 0x01/0x03/0x04/0x08/0x0A |

No other references to thunks 0x5b95a4 / 0x5b95aa exist in the image.

## 2. Low-level wrapper ABI (certain)

```
SendFrame(hDev, srcTemplate, len)   ; ecx = report-id byte -> buf[0]
                                    ; esi = 1032-B local frame
                                    ; memcpy(buf+1, srcTemplate, len)
                                    ; HidD_SetFeature(hDev, buf, len+1); retry 3x, Sleep(200)
GetFrame(hDev, outDst, len)         ; ecx = report-id byte -> buf[0]
                                    ; HidD_GetFeature(hDev, buf, len+1); retry 3x, Sleep(200)
                                    ; memcpy(outDst, buf+1, len)   // payload only
```

Observed report-id/prefix byte (buf[0]) values: **0x05, 0x06, 0x08, 0x09**.
Pattern: read *requests* use 0x05, reads' Get buffer prefilled 0x06, writes use 0x06,
music stream uses 0x08, checksummed flash writes force 0x09.
Chunked engines choose 0x06 or 0x09 at runtime:
`sel = (devField == 0x18) ? 6 : 9` (computed via `setne/dec/and 0xfd/add 9`). This is a
**hardware-revision switch** (device struct field compared to 0x18), not a user mode.

## 3. Reconstructed frame layouts

Byte offsets below are relative to the feature-report buffer actually handed to HidD_*Feature
(i.e. buf[0] = first byte on the wire after the OS report-id mechanics).

### 3.1 Query-style frames (report 0x05/0x06, total ≤ 9 B TX)

*GetPassword* (fn 0x487a10) — medium confidence on exact bytes:
```
off 0 : 05        report/prefix
off 1 : 05        (template[0]; possibly a sub-length/sub-cmd echo slot)
off 2 : 81        cmd = GET password/version info
off 3..8: 00
RX: 8 B payload; payload[0] must be 0x01 (status ok);
    copies DWORD (payload[1..4]) + WORD (payload[5..6]) to caller.
```
Note the adjacent fn 0x487890 logs `"FW Version=0x%x"` — the 0x81 reply carries fw/hw version-ish
fields; whether 0x81 is "get password" or "get version" is ambiguous from strings alone
(GetPassword string sits on THIS call's error path, FW Version print sits one function earlier).

### 3.2 Block read/write pair frames (report 0x05 TX / 0x06 RX, certain layout, inferred meaning)

Common shape: `[prefix][op][target-id][addr/filler...]`:

| Purpose | TX frame | Notes |
|---|---|---|
| write 254-B cfg block "B6" | `06 03 B6 00 00 00 00 00 <254 B data>` (1032-B buffer sent) | fn 0x487b10 |
| read 254-B cfg block "B6" | `05 83 B6 00 00 00 00` → RX `[06] 83 B6 ...` resp[1] must == 0x83 | fn 0x487bb0 |
| write 1 KiB region "D4" | `06 04 D4 00 40 00 00 00 <1024 B>` | fn 0x487d60 |
| read 1 KiB region "D4" | `05 84 D4 00 00 00 00` → RX 1024 B copied out | fn 0x487e20 |
| write 1 KiB op 0x05 + idx | `06 05 <idx> 00 40 00 00 00 <1024 B>` | fn 0x4880f0 |
| write 1 KiB op 0x09 + idx | `06 09 <idx> 00 40 00 00 00 <1024 B>` | fn 0x487ca0 |
| write 1 KiB "B8" | `06 08 B8 00 40 00 00 00 <≤1024 B>` | fn 0x487f10 |
| read "B8" | `05 88 B8 00 00 00 00` → resp[1] must == 0x88 | fn 0x487fe0 |

Interpretation (guess-level): `[op][id]` then either nothing (read) or
`00 40 00 00` which reads naturally as addr32 LE = 0x00004000 (or addr16 0x4000 + pad).
Ops come in read/write pairs: (03,83) B6 · (04,84) D4 · (08,88) B8 · 05/09 idx-variant writes.

### 3.3 Chunked 520-B engines (firmware/config page I/O)

Buffer always 0x208 = 520 B, SetFeature size 0x208, data payload 512 B (0x200), chunk loop
rounds sizes to 512 (sar 9). Three variants:

**(a) Generic write engine 0x48b350** (certain layout):
```
[0] = 06 | 09          hw-rev selector
[1] = cmdID            passed by caller (see §4)
[2] = sub/flag arg
[3] = 00
[4] = total_chunks & 0xff
[5] = chunk_index & 0xff
[6] = chunk_len lo     (= 0x00 for 512)
[7] = chunk_len hi     (= 0x02)
[8..519] = up to 512 B data
mode==2 additionally does GetFeature into same buffer and compares/copies (verify pass).
retry 3x Sleep(70).
```

**(b) Generic read engine 0x48b5d0** (certain layout):
```
[0] = 06 | 09
[1] = 83               fixed READ cmd
[2] = target arg
[3] = 00
[4] = 00
[5] = chunk_index & 0xff
[6..7] = chunk_len LE
(no inline payload; response read back via GetFeature 0x208)
```

**(c) AccessData_Page 0x48e530, cmd 0x0C** (certain layout):
```
[0] = 06 | 09          hw-rev selector
[1] = 0C               page-write cmd
[2] = 00
[3] = caller arg byte
[4] = 00
[5] = 00
[6..7] = chunk_len LE
[8..519] = 512 B page data
SetFeature 0x208, retry 3x Sleep(100), progress callback + "send package %d ok" logs.
```

**(d) Checksummed write engine 0x48f3b0** (layout certain, checksum semantics certain):
```
[0] = 09               forced (no hw-rev branch seen here)
[1] = CHECKSUM         sum(bytes[2..519]) & 0xff, computed as even-offset sum + odd-offset sum
[2] = cmdID            (caller-supplied: 0x01/0x03/0x04/0x08/0x0A observed)
[3..5] = caller args
[6..7] = chunk_len LE
[8..519] = data
After SetFeature: waits ~30 units on an event, compares a device-status field;
optional verify pass re-GetFeatures with buf[0]=09 and checks echo of [2];
on failure retries 3x Sleep(60). Vendor log calls the checksum "CRC"
("AccessData CRC err for nCmdID=%x, retry now").
```

### 3.4 SendMusicData 0x4881b0 (direct SetFeature, no retry wrapper)
```
[0] = 08               report/prefix
[1] = 0A
[2] = 7A  [3] = 01     (together with [2]: could be len16 = 0x017a = 378 = max payload;
                        guess-level)
[4..7] = 00 00 00 00
[8]  = 00
[5?] = idx byte stored at off 5 (arg [ebp+8])
[11..] = music/rhythm payload (memcpy from caller, len ≤ 0x17a)
Total SetFeature length 0x17e = 382.
Error path logs "SendMusicData Err=0x%x".
```
Purpose: streaming audio/music data (almost certainly the music-sync RGB effect feed),
NOT file transfer. Confidence on role high (string), on field split medium.

### 3.5 LED-profile persistence blocks + 5A A5 magic
Function cluster around 0x48d6xx–0x48e4xx moves 0x80 (128)-byte blocks through vtable-backed
read/write calls and validates a **5A A5 magic** at buffer offsets 0xba/0xbb region of the
128-B record (checked `cmp ...,0x5a / cmp ...,0xa5`, 4 attempts, Sleep 100). Logs:
"Cfg(Load): !!!Get wrong led profile data" / "Cfg(Save): bDirtyFlag = 0x%x".
=> Device-side LED-profile records carry a `5A A5` signature; app re-reads them to verify.
Confidence: signature check certain; exact block addressing not fully reconstructed.

Also present: an 8-byte **input-report** poller (0x48abfc, ServiceThread_G5) that accepts a
packet whose bytes match `0A 06` and stores it into dev+0x240 — separate from feature reports.

## 4. Command bytes observed (offset [1] of frame unless noted)

| Byte | Where | Inferred purpose | Conf |
|---|---|---|---|
| 0x81 | GetPassword/query TX | get password / fw-info (reply carries DWORD+WORD, "FW Version" printed nearby) | med |
| 0x01 | checksum engine | AccessData op 1 | low |
| 0x03 | write engines (both) | AccessData op 3 (20-B payload typical) | med |
| 0x03 | standalone | WRITE 254-B cfg block id B6 | med |
| 0x04 | write engines | AccessData op 4 ("GetMacro failed" ctx nearby) | low-med |
| 0x04 | standalone | WRITE 1 KiB region D4 @0x4000 | med |
| 0x05 | standalone | WRITE 1 KiB indexed slot @0x4000 | med |
| 0x06 | write engine | AccessData op 6 ("GetLED failed" ctx nearby) | low-med |
| 0x08 | checksum engine | AccessData op 8 ("GetPassword failed"/keycode ctx nearby) | low-med |
| 0x08 | standalone | WRITE region B8 @0x4000 | med |
| 0x09 | standalone/engine | WRITE 1 KiB indexed slot @0x4000; also hw-rev alt prefix value | med |
| 0x0A | checksum engine + music | AccessData op 0xA ("GetRealData failed" ctx); NOTE also byte[1] of music frame | low-med |
| 0x0B | write engine | AccessData op 0xB | low |
| 0x0C | AccessData_Page | paged 512-B data write | med-high |
| 0x0E | write engine | AccessData op 0xE | low |
| 0x11 | write engine | AccessData op 0x11 ("GetLedRgbTab failed" ctx nearby) | low-med |
| 0x83 | readers | READ block/region (pairs with 03) | high |
| 0x84 | reader | READ 1 KiB region D4 (folklore's "0x84 read region" ✓) | high |
| 0x88 | reader | READ region B8 (resp verified ==0x88) | high |
| 0xB6 | payload byte after op 03/83 | config-block target id (254 B object) | med |
| 0xB8/D4 | payload byte after op 08/88, 04/84 | target ids of 1-KiB regions | med |
| 0x5A A5 | magic inside 128-B LED-profile records (load/save verify) | record signature | high |

Prefix/report-id bytes: 05 (TX read req), 06 (default/write + RX), 08 (music stream),
09 (alt hw-rev prefix / checksummed flash writes).

## 5. SAVE/COMMIT · MODE/SOURCE · SELF-DEFINE candidates

* **No dedicated single-frame SAVE/COMMIT command found** among any SetFeature site. Persistence
  is done by rewriting whole blocks/pages: Cfg(Save) path writes LED-profile 128-B records
  (with 5A A5 sig) / 254-B B6 block / 1-KiB pages, then re-reads to verify. If a commit exists,
  it is most plausibly one of the small AccessData ops (0x03/0x0B/0x0E/0x11) whose purposes the
  binary doesn't name directly. (Explicit: not found, not proven absent.)
* **MODE/SOURCE switch**: closest matches are (a) the runtime prefix switch 0x06↔0x09 keyed on a
  device-rev field ==0x18 — a firmware-variant switch, not user-facing; (b) **SendMusicData**
  ([08][0A][7A][01]...) which feeds the music/rhythm RGB source; entering/leaving that stream is
  effectively a source-mode change but no explicit start/stop control frame was isolated.
* **SELF-DEFINE / custom-mode activation**: no frame or cmd byte identifiable as
  "custom/self-define mode activate". Nearest unexplained surface: AccessData ops 0x0B, 0x0E,
  0x11 and the keycode/Layer handling ("Invaild keycode, Layer=%d") which belongs to key-remap
  territory. Marking as NOT FOUND at feature-report level (may travel over the 8-B input-report
  channel or vendor pages not exercised here).

## 6. Certainty summary

Certain (byte-exact from disassembly): wrapper ABI, all frame layouts in §3.2–3.4 offsets,
520-B sizing, 512-B chunks, checksum algorithm in §3.4, retry/sleep constants (200/100/70/60 ms,
3 tries), 5A A5 check existence, 0x83/0x88 response verification, hw-rev 06/09 selector formula.

Inferred/guessed: semantic names bound via log strings (strong for GetPassword, SendMusicData,
AccessData_Page, LED-profile cfg load/save; weak for individual AccessData op numbers 01–11),
the `00 40 00 00`=addr32(0x4000) reading, `[2..3]=len16 0x017A` reading in the music frame, and
whether 0x81 is password-vs-version. Exact stack-ABI of engine callers was not needed for these
conclusions and was not fully reconstructed.
