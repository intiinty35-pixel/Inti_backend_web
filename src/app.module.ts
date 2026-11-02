import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import appConfiguration from "./config/app.config";
import { PrismaModule } from "./infrastructure/persistence/prisma.module";
import { AuthModule } from "./modules/auth/auth.module";
import { HealthModule } from "./modules/health/health.module";
import { ProfilesModule } from "./modules/profiles/profiles.module";
import { PropertiesModule } from "./modules/properties/properties.module";
import { ProjectsModule } from "./modules/projects/projects.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfiguration],
    }),
    PrismaModule,
    AuthModule,
    HealthModule,
    ProfilesModule,
    PropertiesModule,
    ProjectsModule,
  ],
})
export class AppModule {}
