import { BadRequestException, Controller, Get, Header, NotFoundException, Param, Post, StreamableFile, UploadedFiles, UseGuards, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { ConfigService } from "@nestjs/config";
import { memoryStorage } from "multer";
import { SessionGuard } from "../../auth/session.guard";
import { PropertyFileStorage } from "../infrastructure/property-file-storage";

@Controller("properties/media")
export class PropertyMediaController {
  constructor(
    private readonly config: ConfigService,
    private readonly files: PropertyFileStorage,
  ) {}

  @Post()
  @UseGuards(SessionGuard)
  @UseInterceptors(
    FilesInterceptor("files", 12, {
      storage: memoryStorage(),
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  async upload(@UploadedFiles() files: Array<{ buffer: Buffer }>) {
    if (!files?.length) throw new BadRequestException("Selecciona al menos una imagen.");
    const baseUrl = this.config.get<string>("app.publicUrl", "http://localhost:3001");
    const saved: string[] = [];
    const media: Array<{ url: string; publicId: string; position: number; isCover: boolean }> = [];

    for (const [index, file] of files.entries()) {
      const filename = await this.files.saveImage(file.buffer);
      if (!filename) {
        await this.files.remove(saved);
        throw new BadRequestException("Solo se permiten imágenes JPG, PNG o WEBP.");
      }
      saved.push(filename);
      media.push({
        url: `${baseUrl}/api/properties/media/${filename}`,
        publicId: filename,
        position: index,
        isCover: index === 0,
      });
    }

    return { media };
  }

  @Get(":filename")
  @Header("Cache-Control", "public, max-age=31536000, immutable")
  getImage(@Param("filename") filename: string) {
    const file = this.files.open(filename);
    if (!file) throw new NotFoundException("No se encontró la imagen.");
    return new StreamableFile(file.stream, { type: file.mime });
  }
}
