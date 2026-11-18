const HEIC_MIME_TYPES = new Set([
  "image/heic",
  "image/heif",
  "image/heic-sequence",
  "image/heif-sequence",
]);
const HEIC_BRANDS = new Set(["heic", "heix", "heim", "heis", "hevc", "hevx", "hevm", "hevs"]);
const GENERIC_HEIF_BRANDS = new Set(["mif1", "msf1"]);
const OTHER_IMAGE_BRANDS = new Set(["avif", "avis", "jpeg"]);
const FTYP_HEADER_LIMIT = 4096;

export function isHeicAttachment(fileName?: string | null, contentType?: string | null): boolean {
  const mimeType = contentType?.split(";", 1)[0]?.trim().toLowerCase();
  if (mimeType != null && HEIC_MIME_TYPES.has(mimeType)) return true;
  if (mimeType && mimeType !== "application/octet-stream" && mimeType !== "binary/octet-stream") {
    return false;
  }
  return /\.hei[cf]$/i.test(fileName?.trim() ?? "");
}

function readBrand(header: DataView, offset: number): string {
  return String.fromCharCode(
    header.getUint8(offset),
    header.getUint8(offset + 1),
    header.getUint8(offset + 2),
    header.getUint8(offset + 3),
  );
}

export async function hasHeicFileType(blob: Blob): Promise<boolean> {
  const header = new DataView(await blob.slice(0, FTYP_HEADER_LIMIT).arrayBuffer());
  if (header.byteLength < 16 || readBrand(header, 4) !== "ftyp") return false;

  const shortSize = header.getUint32(0);
  const brandOffset = shortSize === 1 ? 16 : 8;
  if (header.byteLength < brandOffset + 8) return false;
  const boxSize = shortSize === 1 ? Number(header.getBigUint64(8)) : shortSize;
  if (boxSize < brandOffset + 8 || boxSize > header.byteLength || boxSize % 4 !== 0) {
    return false;
  }

  const majorBrand = readBrand(header, brandOffset);
  if (OTHER_IMAGE_BRANDS.has(majorBrand)) return false;
  const brands = [majorBrand];
  // After the major brand and version, each compatible brand uses four bytes.
  for (let offset = brandOffset + 8; offset < boxSize; offset += 4) {
    brands.push(readBrand(header, offset));
  }

  return (
    brands.some((brand) => HEIC_BRANDS.has(brand)) ||
    (GENERIC_HEIF_BRANDS.has(majorBrand) && !brands.some((brand) => OTHER_IMAGE_BRANDS.has(brand)))
  );
}
