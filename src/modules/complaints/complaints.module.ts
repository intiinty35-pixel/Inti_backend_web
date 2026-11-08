import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { AdminComplaintsController, PublicComplaintsController } from "./complaints.controller";
import { ComplaintsService } from "./complaints.service";

@Module({
  imports: [AuthModule],
  controllers: [PublicComplaintsController, AdminComplaintsController],
  providers: [ComplaintsService],
})
export class ComplaintsModule {}
