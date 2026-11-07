import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { CreatePropertyUseCase } from "./application/create-property.use-case";
import { ListPropertiesUseCase } from "./application/list-properties.use-case";
import { PROPERTY_REPOSITORY } from "./domain/property";
import { PrismaPropertyRepository } from "./infrastructure/prisma-property.repository";
import { PropertiesController } from "./presentation/properties.controller";
import { PropertyMediaController } from "./presentation/property-media.controller";

@Module({
  imports: [AuthModule],
  controllers: [PropertiesController, PropertyMediaController],
  providers: [
    CreatePropertyUseCase,
    ListPropertiesUseCase,
    PrismaPropertyRepository,
    { provide: PROPERTY_REPOSITORY, useExisting: PrismaPropertyRepository },
  ],
})
export class PropertiesModule {}
