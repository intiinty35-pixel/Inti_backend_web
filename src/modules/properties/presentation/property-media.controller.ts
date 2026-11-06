import { BadRequestException, Controller, Post, UploadedFiles, UseGuards, UseInterceptors } from "@nestjs/common";
import { FilesInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { SessionGuard } from "../../auth/session.guard";
import { IMAGE_FOLDERS, ImageStorage, type StoredImage } from "../../../shared/image-storage";

const MAX_FILES = 12;
const MAX_FILE_SIZE = 8 * 1024 * 1024;

@Controller("properties/media")
export class PropertyMediaController {
  constructor(private readonly images: ImageStorage) {}

  @Post()
  @UseGuards(SessionGuard)
  @UseInterceptors(FilesInterceptor("files", MAX_FILES, { storage: memoryStorage(), limits: { fileSize: MAX_FILE_SIZE } }))
  async upload(@UploadedFiles() files: Array<{ buffer: Buffer }> = []) {
    if (files.length === 0) throw new BadRequestException("Selecciona al menos una imagen.");

    const saved: StoredImage[] = [];
    try {
      for (const file of files) {
        const image = await this.images.save(file.buffer, IMAGE_FOLDERS.properties);
        if (!image) throw new BadRequestException("Solo se permiten imágenes JPG, PNG o WEBP.");
        saved.push(image);
      }
    } catch (error) {
      await this.images.remove(saved.map((image) => image.publicId));
      throw error;
    }

    return { media: saved.map((image, index) => ({ ...image, position: index, isCover: index === 0 })) };
  }
}
