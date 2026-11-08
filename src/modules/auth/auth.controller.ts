import { BadRequestException, Body, Controller, HttpException, HttpStatus, Ip, Post, Put, Req, UnauthorizedException, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "node:crypto";
import { RateLimiter } from "../../common/rate-limiter";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { PROFILE_ROLES } from "../../shared/profile-role";
import { hashPassword, verifyPassword } from "../../shared/password-hash";
import { AuthTokenService } from "./auth-token.service";
import { LoginDto } from "./login.dto";
import { RegisterAccountDto } from "./presentation/register-account.dto";
import { RegisterAccountUseCase } from "./application/register-account.use-case";
import { SessionGuard, type AuthenticatedRequest } from "./session.guard";
import { ChangePasswordDto } from "./change-password.dto";

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
    private readonly registerAccount: RegisterAccountUseCase,
  ) {}

  @Post("register")
  async register(@Body() input: RegisterAccountDto, @Ip() ip: string) {
    if (!this.attempts.allow(`register|${ip}`)) {
      throw new HttpException("Demasiados registros desde esta conexión. Inténtalo más tarde.", HttpStatus.TOO_MANY_REQUESTS);
    }
    return this.registerAccount.execute(input);
  }

  @Post("login")
  async login(@Body() input: LoginDto, @Ip() ip: string) {
    const email = input.email.trim().toLowerCase();
    const attemptKey = `${email}|${ip}`;
    if (this.attempts.isBlocked(attemptKey)) {
      throw new HttpException("Demasiados intentos. Espera unos minutos e inténtalo de nuevo.", HttpStatus.TOO_MANY_REQUESTS);
    }

    const adminEmail = this.config.get<string>("app.adminEmail", "admin@inti.local").trim().toLowerCase();
    const adminPassword = this.config.get<string>("app.adminPassword", "");

    if (email === adminEmail && adminPassword) {
      const existingAdmin = await this.prisma.user.findUnique({ where: { email: adminEmail } });
      const hasChangedAdminPassword = existingAdmin?.role === PROFILE_ROLES.ADMINISTRATOR && existingAdmin.passwordChangedAt !== null;
      const matchesStoredAdminPassword = existingAdmin?.role === PROFILE_ROLES.ADMINISTRATOR
        ? await verifyPassword(input.password, existingAdmin.passwordHash)
        : false;
      const matchesConfiguredAdminPassword = matchesSecret(input.password, adminPassword);
      const validPassword = hasChangedAdminPassword
        ? matchesStoredAdminPassword
        : matchesConfiguredAdminPassword || matchesStoredAdminPassword;
      if (!validPassword) {
        this.attempts.record(attemptKey);
        throw new UnauthorizedException("Correo o contraseña incorrectos.");
      }

      const admin = await this.prisma.user.upsert({
        where: { email: adminEmail },
        update: {
          name: "Administrador",
          role: PROFILE_ROLES.ADMINISTRATOR,
          isActive: true,
          ...(matchesConfiguredAdminPassword && !hasChangedAdminPassword ? { passwordHash: await hashPassword(adminPassword) } : {}),
        },
        create: {
          name: "Administrador",
          email: adminEmail,
          role: PROFILE_ROLES.ADMINISTRATOR,
          passwordHash: await hashPassword(adminPassword),
        },
      });
      this.attempts.reset(attemptKey);
      const { token, expiresAt } = await this.tokens.sign(admin.id, PROFILE_ROLES.ADMINISTRATOR);
      await this.prisma.loginEvent.create({ data: { userId: admin.id } });
      return { authenticated: true, id: admin.id, role: PROFILE_ROLES.ADMINISTRATOR, name: admin.name, email: admin.email, token, expiresAt };
    }

    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.isActive || user.accountStatus !== "ACTIVE" || !(await verifyPassword(input.password, user.passwordHash))) {
      this.attempts.record(attemptKey);
      throw new UnauthorizedException("Correo o contraseña incorrectos.");
    }
    this.attempts.reset(attemptKey);
    const { token, expiresAt } = await this.tokens.sign(user.id, user.role as (typeof PROFILE_ROLES)[keyof typeof PROFILE_ROLES]);
    await this.prisma.loginEvent.create({ data: { userId: user.id } });
    return { authenticated: true, id: user.id, role: user.role, name: user.name, email: user.email, token, expiresAt };
  }

  @Post("logout")
  @UseGuards(SessionGuard)
  logout() { return { authenticated: false }; }

  @Put("password")
  @UseGuards(SessionGuard)
  async changePassword(@Body() input: ChangePasswordDto, @Req() request: AuthenticatedRequest) {
    if (input.newPassword !== input.confirmPassword) throw new BadRequestException("La nueva contraseña y su confirmación no coinciden.");
    if (!/[A-Z]/.test(input.newPassword) || !/[a-z]/.test(input.newPassword) || !/\d/.test(input.newPassword) || !/[^A-Za-z\d\s]/.test(input.newPassword) || /\s/.test(input.newPassword)) {
      throw new BadRequestException("La nueva contraseña debe incluir mayúscula, minúscula, número y símbolo, sin espacios.");
    }
    const user = await this.prisma.user.findUnique({ where: { id: request.auth.id } });
    if (!user || !(await verifyPassword(input.currentPassword, user.passwordHash))) {
      throw new UnauthorizedException("La contraseña actual es incorrecta.");
    }
    if (await verifyPassword(input.newPassword, user.passwordHash)) {
      throw new BadRequestException("La nueva contraseña debe ser diferente de la actual.");
    }
    await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await hashPassword(input.newPassword), passwordChangedAt: new Date() },
    });
    return { updated: true };
  }
}
