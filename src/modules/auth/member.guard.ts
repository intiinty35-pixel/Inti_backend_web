import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { AuthenticatedRequest } from "./session.guard";

/** Las cuentas administradoras gestionan publicaciones existentes, pero no crean nuevas. */
@Injectable()
export class MemberGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.auth?.role === "ADMINISTRATOR") {
      throw new ForbiddenException("El administrador no puede crear publicaciones; solo gestiona las existentes.");
    }
    return true;
  }
}
