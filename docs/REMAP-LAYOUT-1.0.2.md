# Remap layout correction — 1.0.2

The OEM `KB.ini` stores each key rectangle as left, top, right, bottom.
`tools/gen-keymap.mjs` previously copied right/bottom into width/height fields.
The SVG then drew progressively larger keys, causing the overlaps in the
reported screenshot.

The generator now converts `width = right - left` and
`height = bottom - top`. The regenerated map keeps the same 80 physical keys,
matrix indices, labels and key binding data. Only keycap dimensions change.

`RemapPanel` groups each rectangle and its label into one selection target.
Labels no longer intercept clicks, and unlocked keys support keyboard focus
and Enter/Space selection. The layer controls wrap when space is limited.

The production build completed, including TypeScript compilation. Visual
inspection of the compiled interface confirmed separate proportional keycaps
and a single-key highlight when selecting PgDn. See `remap-1.0.2.png`.
This layout check did not apply any remapping to the keyboard.

Both AppImage and Flatpak 1.0.2 were generated. The system Flatpak was updated
after native administrator authentication, and its installed commit is
`1024231b626a8d5293e6fe06586b74ef37460a1e28ee7eecc84d440194748f6e`.
The updated application was opened normally for the user.
