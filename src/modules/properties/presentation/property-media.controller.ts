import { BadRequestException, Controller, Get, NotFoundException, Param, Post, StreamableFile, UploadedFiles, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { createReadStream, existsSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { basename, extname, join } from "node:path";
import { diskStorage } from "multer";
import { ConfigService } from "@nestjs/config";

const UPLOAD_DIRECTORY = join(process.cwd(), "uploads", "properties");
const ALLOWED_MIME_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
};

@Controller("properties/media")
export class PropertyMediaController {
  constructor(private readonly config: ConfigService) {}

  @Post()
  @UseInterceptors(
    FilesInterceptor("files", 12, {
      storage: diskStorage({
        destination: (_request, _file, callback) => {
          mkdirSync(UPLOAD_DIRECTORY, { recursive: true });
          callback(null, UPLOAD_DIRECTORY);
        },
        filename: (_request, file, callback) => {
          const extension = ALLOWED_MIME_TYPES[file.mimetype];
          callback(null, `${randomUUID()}${extension}`);
        },
      }),
      fileFilter: (_request, file, callback) => {
        if (!ALLOWED_MIME_TYPES[file.mimetype]) {
          callback(new BadRequestException("Solo se permiten imágenes JPG, PNG o WEBP."), false);
          return;
        }
        callback(null, true);
      },
      limits: { fileSize: 8 * 1024 * 1024 },
    }),
  )
  upload(@UploadedFiles() files: Array<{ filename: string }>) {
    const baseUrl = this.config.get<string>("app.publicUrl", "http://localhost:3001");
    return {
      media: files.map((file, index) => ({
        url: `${baseUrl}/api/properties/media/${file.filename}`,
        publicId: file.filename,
        position: index,
        isCover: index === 0,
      })),
    };
  }

  @Get(":filename")
  getImage(@Param("filename") filename: string) {
    const safeName = basename(filename);
    const path = join(UPLOAD_DIRECTORY, safeName);
    if (safeName !== filename || !existsSync(path)) throw new NotFoundException("No se encontró la imagen.");

    const contentType = Object.entries(ALLOWED_MIME_TYPES).find(([, extension]) => extension === extname(safeName))?.[0];
    if (!contentType) throw new NotFoundException("No se encontró la imagen.");
    return new StreamableFile(createReadStream(path), { type: contentType });
  }
}
