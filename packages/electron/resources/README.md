# App Resources

## Icons

Place app icons here for electron-builder packaging:

| File                         | Platform                         | Format | Size                     |
| ---------------------------- | -------------------------------- | ------ | ------------------------ |
| `icon.ico`                   | Windows                          | ICO    | 256×256 (multi-res)      |
| `icon.icns`                  | macOS (app bundle + Installer)   | ICNS   | 1024×1024                |
| `icons/512x512.png`          | Source logo (transparent)        | PNG    | 512×512                  |
| `dock-icon.png`              | macOS Dock (normal)              | PNG    | 512×512                  |
| `dock-icon-unread.png`       | macOS Dock (orange dot baked in) | PNG    | 512×512                  |
| `icon.png`                   | Linux (fallback)                 | PNG    | 512×512                  |
| `icons/256x256.png` …        | Linux multi-size                 | PNG    | various                  |
| `tray-icon.png`              | Windows tray                     | PNG    | 32×32 (shown @16 on Win) |
| `tray-icon-unread.png`       | Windows tray (small dot)         | PNG    | 32×32                    |
| `tray-icon-linux.png`        | Linux StatusNotifier             | PNG    | 32×32 solid white        |
| `tray-icon-linux-unread.png` | Linux tray (small dot)           | PNG    | 32×32                    |
| `tray-icon-mac.png`          | macOS menu bar tray              | PNG    | 32×32 solid white        |
| `tray-icon-mac-unread.png`   | macOS tray (small dot)           | PNG    | 32×32                    |

Runtime code only **loads** these PNGs (no bitmap compositing in main).

## Regenerate Dock icons

After changing the logo or squircle style, rebake Dock assets from `icons/512x512.png`:

```bash
cd packages/electron && node scripts/bake-icon-assets.mjs
```

Requires `electron` from the workspace root. Writes `dock-icon*.png` and `tray-icon*.png` (tray unread uses a smaller dot than Dock).

## Generate Icons

From a source PNG (1024×1024 recommended):

```bash
# macOS: use iconutil
mkdir icon.iconset
sips -z 16 16 source.png --out icon.iconset/icon_16x16.png
sips -z 32 32 source.png --out icon.iconset/icon_16x16@2x.png
sips -z 128 128 source.png --out icon.iconset/icon_128x128.png
sips -z 256 256 source.png --out icon.iconset/icon_128x128@2x.png
sips -z 256 256 source.png --out icon.iconset/icon_256x256.png
sips -z 512 512 source.png --out icon.iconset/icon_256x256@2x.png
sips -z 512 512 source.png --out icon.iconset/icon_512x512.png
sips -z 1024 1024 source.png --out icon.iconset/icon_512x512@2x.png
iconutil -c icns icon.iconset -o icon.icns

# Windows: use electron-icon-builder or online tool
npx electron-icon-builder --input=source.png --output=./

# Linux: resize for each size
for size in 16 32 48 64 128 256 512; do
  convert source.png -resize ${size}x${size} icons/${size}x${size}.png
done
cp icons/512x512.png icon.png
```
