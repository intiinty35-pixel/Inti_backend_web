import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { ImageStorage } from "../../shared/image-storage";
import { PrismaService } from "../persistence/prisma.service";
import { CloudinaryImageStorage } from "./cloudinary-image-storage";

@Global()
@Module({
  providers: [
    {
      provide: ImageStorage,
      inject: [ConfigService, PrismaService],
      // El SDK lee CLOUDINARY_URL al importarse; cargarlo aquí, tras validar la configuración, da un error claro si el valor es incorrecto.
      useFactory: async (config: ConfigService, prisma: PrismaService) => {
        const { v2 } = await import("cloudinary");
        return new CloudinaryImageStorage(config, prisma, v2);
      },
    },
  ],
  exports: [ImageStorage],
})
export class StorageModule {}
