import { randomUUID } from "node:crypto";
import { createReadStream, existsSync, mkdirSync } from "node:fs";
import { unlink, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

const IMAGE_TYPES = {
  jpeg: { extension: ".jpg", mime: "image/jpeg" },
  png: { extension: ".png", mime: "image/png" },
  webp: { extension: ".webp", mime: "image/webp" },
} as const;

type ImageKind = keyof typeof IMAGE_TYPES;

/** Detecta el formato real por los primeros bytes, sin confiar en el tipo que declara el cliente. */
function detectImageKind(buffer: Buffer): ImageKind | null {
  if (buffer.length > 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "jpeg";
  if (buffer.length > 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buffer.length > 12 && buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  return null;
}

/** Almacenamiento local de imágenes compartido por los módulos que suben archivos. */
export class ImageFileStorage {
  constructor(protected readonly directory: string) {}

  /** Guarda la imagen y devuelve su nombre, o null cuando el contenido no es JPG, PNG ni WEBP. */
  async saveImage(buffer: Buffer): Promise<string | null> {
    const kind = detectImageKind(buffer);
    if (!kind) return null;
    mkdirSync(this.directory, { recursive: true });
    const filename = `${randomUUID()}${IMAGE_TYPES[kind].extension}`;
    await writeFile(join(this.directory, filename), buffer);
    return filename;
  }

  open(filename: string): { stream: ReturnType<typeof createReadStream>; mime: string } | null {
    const safeName = basename(filename);
    const path = join(this.directory, safeName);
    const mime = Object.values(IMAGE_TYPES).find((type) => safeName.endsWith(type.extension))?.mime;
    if (safeName !== filename || !mime || !existsSync(path)) return null;
    return { stream: createReadStream(path), mime };
  }

  /** Elimina archivos que ya no se usan; ignora los que no existan. */
  async remove(publicIds: string[]): Promise<void> {
    await Promise.all(
      publicIds.map(async (publicId) => {
        const safeName = basename(publicId);
        if (safeName !== publicId) return;
        await unlink(join(this.directory, safeName)).catch(() => undefined);
      }),
    );
  }
}
