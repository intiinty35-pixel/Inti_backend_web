import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { FavoritesService } from "./application/favorites.service";
import { FavoritesController } from "./presentation/favorites.controller";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [FavoritesController],
  providers: [FavoritesService],
  exports: [FavoritesService],
})
export class FavoritesModule {}
