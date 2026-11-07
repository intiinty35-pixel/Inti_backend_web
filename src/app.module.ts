import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import appConfiguration from "./config/app.config";
import { validateEnvironment } from "./config/env.validation";
import { PrismaModule } from "./infrastructure/persistence/prisma.module";
import { StorageModule } from "./infrastructure/storage/storage.module";
import { AuthModule } from "./modules/auth/auth.module";
import { HealthModule } from "./modules/health/health.module";
import { DashboardModule } from "./modules/dashboard/dashboard.module";
import { InquiriesModule } from "./modules/inquiries/inquiries.module";
import { ProfilesModule } from "./modules/profiles/profiles.module";
import { PropertiesModule } from "./modules/properties/properties.module";
import { ProjectsModule } from "./modules/projects/projects.module";
import { UsersModule } from "./modules/users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [appConfiguration],
      validate: validateEnvironment,
    }),
    PrismaModule,
    StorageModule,
    AuthModule,
    HealthModule,
    DashboardModule,
    InquiriesModule,
    ProfilesModule,
    UsersModule,
    PropertiesModule,
    ProjectsModule,
  ],
})
export class AppModule {}
