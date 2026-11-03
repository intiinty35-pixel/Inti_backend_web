import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import type { AuthenticatedRequest } from "./session.guard";

/** Las cuentas administradoras solo pueden eliminar publicaciones, no crearlas ni editarlas. */
@Injectable()
export class MemberGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (request.auth?.role === "ADMINISTRATOR") {
      throw new ForbiddenException("El administrador solo puede eliminar publicaciones.");
    }
    return true;
  }
}
