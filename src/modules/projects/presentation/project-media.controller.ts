import {
  BadRequestException,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Post,
  StreamableFile,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { FilesInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { SessionGuard } from "../../auth/session.guard";
import { ProjectFileStorage } from "../infrastructure/project-file-storage";

const MAX_FILES = 12;
const MAX_FILE_SIZE = 8 * 1024 * 1024;

@Controller("projects/media")
export class ProjectMediaController {
  constructor(
    private readonly config: ConfigService,
    private readonly files: ProjectFileStorage,
  ) {}

  @Post()
  @UseGuards(SessionGuard)
  @UseInterceptors(FilesInterceptor("files", MAX_FILES, { storage: memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } }))
  async upload(@UploadedFiles() uploads: Array<{ buffer: Buffer }> = []) {
    if (uploads.length === 0) throw new BadRequestException("Selecciona al menos una imagen.");

    const saved: string[] = [];
    for (const upload of uploads) {
      const filename = await this.files.saveImage(upload.buffer);
      if (!filename) {
        await this.files.remove(saved);
        throw new BadRequestException("Solo se permiten imágenes JPG, PNG o WEBP.");
      }
      saved.push(filename);
    }

    const baseUrl = this.config.get<string>("app.publicUrl", "http://localhost:3001");
    return { media: saved.map((filename) => ({ url: `${baseUrl}/api/projects/media/${filename}`, publicId: filename })) };
  }

  @Get(":filename")
  @Header("Cache-Control", "public, max-age=86400, immutable")
  getImage(@Param("filename") filename: string) {
    const file = this.files.open(filename);
    if (!file) throw new NotFoundException("No se encontró la imagen.");
    return new StreamableFile(file.stream, { type: file.mime });
  }
}
