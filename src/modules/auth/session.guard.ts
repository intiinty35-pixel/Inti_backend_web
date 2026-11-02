import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { AuthTokenService } from "./auth-token.service";
import { readBearerToken, type RequestWithAuthorization } from "./admin.guard";

export interface AuthenticatedRequest extends RequestWithAuthorization {
  auth: { id: string; name: string; email: string; role: string };
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly tokens: AuthTokenService,
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const payload = await this.tokens.verify(readBearerToken(request));
    if (!payload) throw new UnauthorizedException("Inicia sesión para continuar.");

    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });
    if (user) {
      if (!user.isActive || user.role !== payload.role) throw new UnauthorizedException("La sesión ya no es válida.");
      request.auth = { id: user.id, name: user.name, email: user.email, role: user.role };
      return true;
    }

    const adminEmail = this.config.get<string>("app.adminEmail", "admin@inti.local").toLowerCase();
    if (payload.role === "ADMINISTRATOR" && payload.sub.toLowerCase() === adminEmail) {
      request.auth = { id: payload.sub, name: "Administrador", email: payload.sub, role: payload.role };
      return true;
    }

    throw new UnauthorizedException("La sesión ya no es válida.");
  }
}
