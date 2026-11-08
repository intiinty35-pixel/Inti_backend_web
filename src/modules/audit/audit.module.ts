import { CallHandler, Controller, ExecutionContext, Get, HttpException, Injectable, Logger, MiddlewareConsumer, Module, NestInterceptor, NestMiddleware, NestModule, Param, Query, RequestMethod, UseGuards } from "@nestjs/common";
import { APP_INTERCEPTOR } from "@nestjs/core";
import { randomUUID } from "node:crypto";
import { catchError, defer, from, map, mergeMap, Observable, throwError } from "rxjs";
import { AuthModule } from "../auth/auth.module";
import { SessionGuard } from "../auth/session.guard";
import { AdminGuard } from "../auth/admin.guard";
import { auditContext, AuditContext, AuditRequest } from "./audit-context";
import { AuditService, classifyRequest } from "./audit.service";
import { AuditQueryDto } from "./audit.dto";

interface AuditResponse { statusCode: number; setHeader(name: string, value: string): void; on(event: string, callback: () => void): void }

@Injectable()
class AuditMiddleware implements NestMiddleware {
  private readonly logger = new Logger(AuditMiddleware.name);
  constructor(private readonly audit: AuditService) {}
  use(request: AuditRequest, response: AuditResponse, next: () => void) {
    const context: AuditContext = { request, requestId: randomUUID() };
    response.setHeader("X-Request-ID", context.requestId);
    response.on("finish", () => {
      if (!context.intercepted && classifyRequest(request).tracked) void auditContext.run(context, async () => {
        await this.audit.prepare(context, false);
        await this.audit.record(context, undefined, response.statusCode, response.statusCode >= 400);
      }).catch(() => this.logger.error("No se pudo registrar el acceso rechazado."));
    });
    auditContext.run(context, next);
  }
}

@Injectable()
class AuditInterceptor implements NestInterceptor {
  constructor(private readonly audit: AuditService) {}
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<AuditRequest>();
    if (!classifyRequest(request).tracked) return next.handle();
    const store = auditContext.getStore() ?? { request, requestId: randomUUID() };
    store.intercepted = true;
    const response = context.switchToHttp().getResponse<AuditResponse>();
    return new Observable((subscriber) => auditContext.run(store, () => defer(() => this.audit.prepare(store)).pipe(
      mergeMap(() => next.handle()),
      mergeMap((result: unknown) => from(this.audit.record(store, result, response.statusCode)).pipe(map(() => result))),
      catchError((error: unknown) => from(this.audit.record(store, undefined, error instanceof HttpException ? error.getStatus() : 500, true, error instanceof HttpException ? error.getResponse() : "Error interno")).pipe(mergeMap(() => throwError(() => error)))),
    ).subscribe(subscriber)));
  }
}

@Controller("audit")
@UseGuards(SessionGuard, AdminGuard)
class AuditController {
  constructor(private readonly audit: AuditService) {}
  @Get() list(@Query() query: AuditQueryDto) { return this.audit.list(query); }
  @Get("options") options() { return this.audit.options(); }
  @Get(":id") detail(@Param("id") id: string) { return this.audit.detail(id); }
}

@Module({ imports: [AuthModule], controllers: [AuditController], providers: [AuditService, AuditMiddleware, { provide: APP_INTERCEPTOR, useClass: AuditInterceptor }] })
export class AuditModule implements NestModule {
  configure(consumer: MiddlewareConsumer) { consumer.apply(AuditMiddleware).forRoutes({ path: "{*path}", method: RequestMethod.ALL }); }
}
