import { Controller, Delete, Get, Param, Patch, Query, Req, UseGuards } from "@nestjs/common";
import { Transform, Type } from "class-transformer";
import { IsBooleanString, IsInt, IsOptional, Max, Min } from "class-validator";
import { SessionGuard, type AuthenticatedRequest } from "../../auth/session.guard";
import { NotificationsService } from "../application/notifications.service";

class ListNotificationsQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100)
  limit?: number;

  @IsOptional() @Transform(({ value }: { value: unknown }) => (typeof value === "string" ? value : undefined)) @IsBooleanString()
  unread?: string;
}

@Controller("notifications")
@UseGuards(SessionGuard)
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  list(@Req() request: AuthenticatedRequest, @Query() query: ListNotificationsQuery) {
    return this.notifications.list(request.auth.id, { limit: query.limit, unreadOnly: query.unread === "true" });
  }

  @Get("unread-count")
  unreadCount(@Req() request: AuthenticatedRequest) {
    return this.notifications.unreadCount(request.auth.id);
  }

  @Patch("read-all")
  markAllRead(@Req() request: AuthenticatedRequest) {
    return this.notifications.markAllRead(request.auth.id);
  }

  @Patch(":id/read")
  markRead(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.notifications.markRead(request.auth.id, id);
  }

  @Delete(":id")
  remove(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.notifications.remove(request.auth.id, id);
  }
}
