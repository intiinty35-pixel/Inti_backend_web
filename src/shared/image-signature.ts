const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export type ImageKind = "jpeg" | "png" | "webp";

/** Detecta el formato real por los primeros bytes, sin confiar en el tipo que declara el cliente. */
export function detectImageKind(buffer: Buffer): ImageKind | null {
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (buffer.length > 8 && buffer.subarray(0, 8).equals(PNG_SIGNATURE)) return "png";
  if (buffer.length > 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") {
    return "webp";
  }
  return null;
}

export const isSupportedImage = (buffer: Buffer): boolean => detectImageKind(buffer) !== null;
