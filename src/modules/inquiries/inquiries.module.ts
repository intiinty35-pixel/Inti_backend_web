import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { InquiriesService } from "./application/inquiries.service";
import { InquiriesController } from "./presentation/inquiries.controller";

@Module({
  imports: [AuthModule, NotificationsModule],
  controllers: [InquiriesController],
  providers: [InquiriesService],
  exports: [InquiriesService],
})
export class InquiriesModule {}
