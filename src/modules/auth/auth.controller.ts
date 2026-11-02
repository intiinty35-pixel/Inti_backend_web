import { Body, Controller, HttpException, HttpStatus, Ip, Post, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "node:crypto";
import { RateLimiter } from "../../common/rate-limiter";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { PROFILE_ROLES } from "../../shared/profile-role";
import { hashPassword, verifyPassword } from "../../shared/password-hash";
import { AuthTokenService } from "./auth-token.service";
import { LoginDto } from "./login.dto";

function matchesSecret(candidate: string, expected: string): boolean {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
}

@Controller("auth")
export class AuthController {
  private readonly attempts = new RateLimiter(8, 10 * 60 * 1000);

  constructor(
    private readonly config: ConfigService,
    private readonly tokens: AuthTokenService,
    private readonly prisma: PrismaService,
  ) {}

  @Post("login")
  async login(@Body() input: LoginDto, @Ip() ip: string) {
    if (!this.attempts.allow(ip)) {
      throw new HttpException("Demasiados intentos. Espera unos minutos e inténtalo de nuevo.", HttpStatus.TOO_MANY_REQUESTS);
    }

    const email = input.email.trim().toLowerCase();
    const adminEmail = this.config.get<string>("app.adminEmail", "admin@inti.local").trim().toLowerCase();
    const adminPassword = this.config.get<string>("app.adminPassword", "");

    if (email === adminEmail && adminPassword) {
      if (!matchesSecret(input.password, adminPassword)) {
        throw new UnauthorizedException("Correo o contraseña incorrectos.");
      }

      const admin = await this.prisma.user.upsert({
        where: { email: adminEmail },
        update: { name: "Administrador", role: PROFILE_ROLES.ADMINISTRATOR, isActive: true, passwordHash: hashPassword(adminPassword) },
        create: {
          name: "Administrador",
          email: adminEmail,
          role: PROFILE_ROLES.ADMINISTRATOR,
          passwordHash: hashPassword(adminPassword),
        },
      });
      const { token, expiresAt } = await this.tokens.sign(admin.id, PROFILE_ROLES.ADMINISTRATOR);
      await this.prisma.loginEvent.create({ data: { userId: admin.id } });
      return { authenticated: true, id: admin.id, role: PROFILE_ROLES.ADMINISTRATOR, name: admin.name, email: admin.email, token, expiresAt };
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive || !verifyPassword(input.password, user.passwordHash)) {
      throw new UnauthorizedException("Correo o contraseña incorrectos.");
    }
    const { token, expiresAt } = await this.tokens.sign(user.id, user.role as (typeof PROFILE_ROLES)[keyof typeof PROFILE_ROLES]);
    await this.prisma.loginEvent.create({ data: { userId: user.id } });
    return { authenticated: true, id: user.id, role: user.role, name: user.name, email: user.email, token, expiresAt };
  }
}
