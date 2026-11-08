import { Body, Controller, Get, Header, HttpException, HttpStatus, Ip, Param, Post, Query, StreamableFile, UseGuards } from "@nestjs/common";
import { RateLimiter } from "../../common/rate-limiter";
import { AdminGuard } from "../auth/admin.guard";
import { SessionGuard } from "../auth/session.guard";
import { ComplaintListQueryDto, CreateComplaintDto } from "./complaints.dto";
import { createComplaintPdf } from "./complaint-pdf";
import { ComplaintsService } from "./complaints.service";

@Controller("complaints")
export class PublicComplaintsController {
  private readonly submissions = new RateLimiter(5, 15 * 60 * 1000);

  constructor(private readonly complaints: ComplaintsService) {}

  @Post()
  create(@Body() input: CreateComplaintDto, @Ip() ip: string) {
    if (!this.submissions.allow(ip || "unknown")) {
      throw new HttpException("Se alcanzó el límite de envíos. Inténtalo más tarde.", HttpStatus.TOO_MANY_REQUESTS);
    }
    return this.complaints.create(input);
  }
}

@Controller("complaints/admin")
@UseGuards(SessionGuard, AdminGuard)
export class AdminComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Get()
  list(@Query() query: ComplaintListQueryDto) { return this.complaints.list(query); }

  @Get(":id/pdf")
  @Header("Cache-Control", "private, no-store")
  @Header("X-Content-Type-Options", "nosniff")
  async pdf(@Param("id") id: string) {
    const record = await this.complaints.detail(id);
    const buffer = createComplaintPdf({ ...record, createdAt: new Date(record.createdAt) });
    return new StreamableFile(buffer, {
      type: "application/pdf",
      disposition: `attachment; filename="${record.ticketNumber}.pdf"`,
    });
  }

  @Get(":id")
  detail(@Param("id") id: string) { return this.complaints.detail(id); }
}
