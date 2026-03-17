# App Resources

## Icons

Place app icons here for electron-builder packaging:

| File                | Platform         | Format | Size                |
| ------------------- | ---------------- | ------ | ------------------- |
| `icon.ico`          | Windows          | ICO    | 256×256 (multi-res) |
| `icon.icns`         | macOS            | ICNS   | 1024×1024           |
| `icon.png`          | Linux (fallback) | PNG    | 512×512             |
| `icons/512x512.png` | Linux            | PNG    | 512×512             |
| `icons/256x256.png` | Linux            | PNG    | 256×256             |
| `icons/128x128.png` | Linux            | PNG    | 128×128             |
| `icons/64x64.png`   | Linux            | PNG    | 64×64               |
| `icons/48x48.png`   | Linux            | PNG    | 48×48               |
| `icons/32x32.png`   | Linux            | PNG    | 32×32               |
| `icons/16x16.png`   | Linux            | PNG    | 16×16               |

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
