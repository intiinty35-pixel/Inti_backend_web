import { Body, Controller, Get, Header, HttpException, HttpStatus, Ip, Param, Post, Query, StreamableFile, UploadedFiles, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileFieldsInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
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
  @UseInterceptors(FileFieldsInterceptor([{ name: "attachments", maxCount: 5 }], { storage: memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 5 } }))
  create(
    @Body() input: CreateComplaintDto,
    @UploadedFiles() uploads: { attachments?: Array<{ originalname: string; mimetype: string; buffer: Buffer; size: number }> } = {},
    @Ip() ip: string,
  ) {
    if (!this.submissions.allow(ip || "unknown")) {
      throw new HttpException("Se alcanzó el límite de envíos. Inténtalo más tarde.", HttpStatus.TOO_MANY_REQUESTS);
    }
    return this.complaints.create(input, uploads.attachments ?? []);
  }
}

@Controller("complaints/admin")
@UseGuards(SessionGuard, AdminGuard)
export class AdminComplaintsController {
  constructor(private readonly complaints: ComplaintsService) {}

  @Get()
  list(@Query() query: ComplaintListQueryDto) { return this.complaints.list(query); }

  @Get("pdf")
  @Header("Cache-Control", "private, no-store")
  @Header("X-Content-Type-Options", "nosniff")
  emptyPdf() {
    const buffer = createComplaintPdf({
      claimantFirstName: "",
      claimantLastName: "",
      documentNumber: "",
      claimantPhone: "",
      claimantEmail: "",
    });
    return new StreamableFile(buffer, {
      type: "application/pdf",
      disposition: 'attachment; filename="libro-reclamaciones.pdf"',
    });
  }

  @Get(":id/pdf")
  @Header("Cache-Control", "private, no-store")
  @Header("X-Content-Type-Options", "nosniff")
  async pdf(@Param("id") id: string) {
    const record = await this.complaints.detail(id);
    const buffer = createComplaintPdf({
      claimantFirstName: record.claimantFirstName,
      claimantLastName: record.claimantLastName,
      documentNumber: record.documentNumber,
      claimantPhone: record.claimantPhone,
      claimantEmail: record.claimantEmail,
    });
    return new StreamableFile(buffer, {
      type: "application/pdf",
      disposition: `attachment; filename="${record.ticketNumber}.pdf"`,
    });
  }

  @Get(":id/attachments/:attachmentId")
  @Header("Cache-Control", "private, no-store")
  @Header("Content-Security-Policy", "sandbox")
  @Header("X-Content-Type-Options", "nosniff")
  async attachment(@Param("id") id: string, @Param("attachmentId") attachmentId: string) {
    const file = await this.complaints.readAttachment(id, attachmentId);
    return new StreamableFile(file.buffer, {
      type: file.mimeType,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}`,
    });
  }

  @Get(":id")
  detail(@Param("id") id: string) { return this.complaints.detail(id); }
}
