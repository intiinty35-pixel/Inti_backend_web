import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { AuthTokenService } from "./auth-token.service";

export interface RequestWithAuthorization {
  headers: { authorization?: string };
}

export function readBearerToken(request: RequestWithAuthorization): string | undefined {
  const header = request.headers.authorization;
  return header?.startsWith("Bearer ") ? header.slice(7).trim() : undefined;
}

@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly tokens: AuthTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<RequestWithAuthorization>();
    if (!(await this.tokens.isAdministrator(readBearerToken(request)))) {
      throw new UnauthorizedException("Inicia sesión como administrador para realizar esta acción.");
    }
    return true;
  }
}
