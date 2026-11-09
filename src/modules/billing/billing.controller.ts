import { Body, CanActivate, Controller, Delete, ExecutionContext, Get, Header, HttpException, Injectable, Param, Patch, Post, Put, Query, Req, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { memoryStorage } from "multer";
import { RateLimiter } from "../../common/rate-limiter";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { AdminGuard } from "../auth/admin.guard";
import { SessionGuard, type AuthenticatedRequest } from "../auth/session.guard";
import { BillingCatalogService } from "./billing-catalog.service";
import { BillingOrdersService } from "./billing-orders.service";
import { PaymentReceiptsService, ReceiptUpload } from "./payment-receipts.service";
import { SubscriptionPolicyService } from "./subscription-policy.service";
import { BillingAccountsService } from "./billing-accounts.service";
import { AccountStateDto, BillingQueryDto, BillingSettingsDto, CreateOrderDto, PaymentMethodDto, PlanDto, PlanVisibilityDto, PublicationDecisionDto, PublicationDto, ReviewPaymentDto } from "./billing.dto";

@Injectable()
export class BillingRateGuard implements CanActivate {
  private readonly limiter = new RateLimiter(20, 60000);
  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest & { method: string }>();
    if (request.method !== "GET" && !this.limiter.allow(request.auth.id)) throw new HttpException("Demasiadas solicitudes. Espera un minuto.", 429);
    return true;
  }
}

@Controller("billing")
export class BillingCatalogController {
  constructor(private readonly catalog: BillingCatalogService) {}
  @Get("catalog") catalogPublic() { return this.catalog.catalog(); }
}

@Controller("billing")
@UseGuards(SessionGuard, BillingRateGuard)
export class BillingController {
  constructor(private readonly orders: BillingOrdersService, private readonly receipts: PaymentReceiptsService, private readonly subscriptions: SubscriptionPolicyService) {}
  @Get("account") account(@Req() req: AuthenticatedRequest) { return this.subscriptions.account(req.auth.id); }
  @Get("orders") list(@Query() query: BillingQueryDto, @Req() req: AuthenticatedRequest) { return this.orders.list(query, req.auth.id); }
  @Get("orders/:id") detail(@Param("id") id: string, @Req() req: AuthenticatedRequest) { return this.orders.detail(id, req.auth.id); }
  @Post("orders") create(@Body() input: CreateOrderDto, @Req() req: AuthenticatedRequest) { return this.orders.create(req.auth.id, input); }
  @Post("plans/:id/activate-free") free(@Param("id") id: string, @Req() req: AuthenticatedRequest) { return this.orders.activateFree(req.auth.id, id); }
  @Patch("orders/:id/cancel") cancel(@Param("id") id: string, @Req() req: AuthenticatedRequest) { return this.orders.cancel(id, req.auth.id); }
  @Post("orders/:id/receipts")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } }))
  upload(@Param("id") id: string, @Req() req: AuthenticatedRequest, @UploadedFile() file?: ReceiptUpload) { return this.receipts.save(id, req.auth.id, file); }
  @Get("receipts/:id")
  @Header("Cache-Control", "private, no-store")
  @Header("Content-Security-Policy", "sandbox")
  @Header("X-Content-Type-Options", "nosniff")
  async read(@Param("id") id: string, @Req() req: AuthenticatedRequest) {
    const file = await this.receipts.read(id, req.auth.id);
    return new StreamableFile(file.buffer, { type: file.mimeType, disposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}` });
  }
  @Post("publications/:id/request")
  requestPublication(@Param("id") id: string, @Req() req: AuthenticatedRequest, @Body() input: PublicationDto) { return this.subscriptions.request(id, req.auth.id, input.featured); }
}

@Controller("billing/admin")
@UseGuards(SessionGuard, AdminGuard, BillingRateGuard)
export class BillingAdminController {
  constructor(private readonly catalog: BillingCatalogService, private readonly orders: BillingOrdersService, private readonly receipts: PaymentReceiptsService, private readonly accounts: BillingAccountsService, private readonly policy: SubscriptionPolicyService, private readonly prisma: PrismaService) {}
  @Get("catalog") configuration() { return this.catalog.catalog(true); }
  @Put("plans/:id") plan(@Param("id") id: string, @Body() input: PlanDto, @Req() req: AuthenticatedRequest) { return this.catalog.updatePlan(id, input, req.auth.id); }
  @Patch("plans/:id/visibility") visibility(@Param("id") id: string, @Body() input: PlanVisibilityDto, @Req() req: AuthenticatedRequest) { return this.catalog.visibility(id, req.auth.id, input.isActive); }
  @Delete("plans/:id") archive(@Param("id") id: string, @Req() req: AuthenticatedRequest) { return this.catalog.archive(id, req.auth.id); }
  @Post("plans/:id/restore") restore(@Param("id") id: string, @Req() req: AuthenticatedRequest) { return this.catalog.archive(id, req.auth.id, true); }
  @Put("settings") settings(@Body() input: BillingSettingsDto, @Req() req: AuthenticatedRequest) { return this.catalog.updateSettings(input, req.auth.id); }
  @Put("methods/:id") method(@Param("id") id: string, @Body() input: PaymentMethodDto, @Req() req: AuthenticatedRequest) { return this.catalog.updateMethod(id, input, req.auth.id); }
  @Post("methods/:id/qr")
  @UseInterceptors(FileInterceptor("file", { storage: memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } }))
  uploadQr(@Param("id") id: string, @UploadedFile() file: ReceiptUpload, @Req() req: AuthenticatedRequest) {
    if (!file) throw new HttpException("Selecciona una imagen del QR.", 400);
    return this.catalog.uploadQr(id, file.buffer, req.auth.id);
  }
  @Get("orders") list(@Query() query: BillingQueryDto) { return this.orders.list(query); }
  @Get("payment-approvals") listPaymentApprovals(@Query() query: BillingQueryDto) { return this.orders.listForApproval(query); }
  @Get("orders/:id") detail(@Param("id") id: string) { return this.orders.detail(id); }
  @Patch("payment-approvals/:id/decision") decidePayment(@Param("id") id: string, @Body() input: ReviewPaymentDto, @Req() req: AuthenticatedRequest) { return this.orders.review(id, req.auth.id, input); }
  @Get("dashboard") dashboard(@Query() query: BillingQueryDto) { return this.orders.dashboard(query); }
  @Get("receipts/:id")
  @Header("Cache-Control", "private, no-store")
  @Header("Content-Security-Policy", "sandbox")
  @Header("X-Content-Type-Options", "nosniff")
  async read(@Param("id") id: string) {
    const file = await this.receipts.read(id);
    return new StreamableFile(file.buffer, { type: file.mimeType, disposition: `attachment; filename*=UTF-8''${encodeURIComponent(file.originalName)}` });
  }
  @Get("users/:id") user(@Param("id") id: string) { return this.accounts.detail(id); }
  @Patch("users/:id/status") userStatus(@Param("id") id: string, @Body() input: AccountStateDto, @Req() req: AuthenticatedRequest) { return this.accounts.change(id, req.auth.id, input); }
  @Patch("publications/:id/reject") reject(@Param("id") id: string, @Body() input: PublicationDecisionDto, @Req() req: AuthenticatedRequest) { return this.policy.reject(id, req.auth.id, input.reason); }
  @Get("notifications") async notifications() { return this.prisma.notificationOutbox.groupBy({ by: ["status"], _count: { _all: true } }); }
}
