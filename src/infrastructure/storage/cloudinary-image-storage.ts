import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { UploadApiResponse, v2 } from "cloudinary";
import { isSupportedImage } from "../../shared/image-signature";
import { IMAGE_ROOT, ImageStorage, type ImageFolder, type StoredImage } from "../../shared/image-storage";
import { PrismaService } from "../persistence/prisma.service";

/** SDK de Cloudinary; se recibe por constructor para cargarlo de forma diferida y poder simularlo en las pruebas. */
export type CloudinarySdk = typeof v2;

@Injectable()
export class CloudinaryImageStorage extends ImageStorage {
  private readonly logger = new Logger(CloudinaryImageStorage.name);

  constructor(
    config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly cloudinary: CloudinarySdk,
  ) {
    super();
    const { cloudName, apiKey, apiSecret } = config.get<{ cloudName: string; apiKey: string; apiSecret: string }>("app.cloudinary", {
      cloudName: "",
      apiKey: "",
      apiSecret: "",
    });
    // Sin las tres variables sueltas, el SDK toma las credenciales de CLOUDINARY_URL.
    this.cloudinary.config(cloudName && apiKey && apiSecret ? { cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret, secure: true } : { secure: true });
  }

  async save(buffer: Buffer, folder: ImageFolder): Promise<StoredImage | null> {
    if (!isSupportedImage(buffer)) return null;

    try {
      const result = await new Promise<UploadApiResponse>((resolve, reject) => {
        this.cloudinary.uploader
          .upload_stream({ folder, resource_type: "image", unique_filename: true, use_filename: false }, (error, response) => {
            if (error || !response) reject(error ?? new Error("Cloudinary no devolvió una respuesta."));
            else resolve(response);
          })
          .end(buffer);
      });
      return { url: result.secure_url, publicId: result.public_id };
    } catch (error) {
      this.logger.error(`No se pudo subir la imagen a Cloudinary: ${error instanceof Error ? error.message : String(error)}`);
      throw new Error("No se pudo guardar la imagen en el servicio de almacenamiento.");
    }
  }

  async remove(publicIds: string[]): Promise<void> {
    const candidates = [...new Set(publicIds)].filter((publicId) => publicId.startsWith(`${IMAGE_ROOT}/`));
    if (candidates.length === 0) return;

    // Una imagen que otro registro sigue usando no se borra: el identificador llega desde el cliente al crear o editar.
    const [projectRefs, propertyRefs] = await Promise.all([
      this.prisma.projectMedia.findMany({ where: { publicId: { in: candidates } }, select: { publicId: true } }),
      this.prisma.propertyMedia.findMany({ where: { publicId: { in: candidates } }, select: { publicId: true } }),
    ]);
    const inUse = new Set([...projectRefs, ...propertyRefs].map((item) => item.publicId));

    await Promise.all(
      candidates
        .filter((publicId) => !inUse.has(publicId))
        .map((publicId) =>
          this.cloudinary.uploader.destroy(publicId, { resource_type: "image", invalidate: true }).catch((error: unknown) => {
            this.logger.warn(`No se pudo eliminar ${publicId} de Cloudinary: ${error instanceof Error ? error.message : String(error)}`);
          }),
        ),
    );
  }
}
