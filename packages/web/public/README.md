# Public Assets — PWA Icons

Place these icon files here for PWA and favicon support:

| File                               | Size    | Purpose                                         |
| ---------------------------------- | ------- | ----------------------------------------------- |
| `favicon.svg`                      | vector  | Browser tab icon (already created, placeholder) |
| `favicon-unread.svg`               | vector  | Browser tab icon with unread dot                |
| `organization-fallback-unread.svg` | vector  | Org fallback favicon with unread dot            |
| `favicon-32x32.png`                | 32×32   | Fallback favicon                                |
| `favicon.ico`                      | multi   | Legacy favicon                                  |
| `pwa-192x192.png`                  | 192×192 | PWA manifest icon                               |
| `pwa-512x512.png`                  | 512×512 | PWA manifest icon + maskable                    |
| `apple-touch-icon.png`             | 180×180 | iOS home screen icon                            |

## Generate from source

From a source PNG (512×512+ recommended):

```bash
# Using ImageMagick
convert source.png -resize 192x192 public/pwa-192x192.png
convert source.png -resize 512x512 public/pwa-512x512.png
convert source.png -resize 180x180 public/apple-touch-icon.png
convert source.png -resize 32x32 public/favicon-32x32.png
convert source.png -resize 32x32 public/favicon.ico
```
