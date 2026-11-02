import { Body, Controller, HttpException, HttpStatus, Ip, Post, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "node:crypto";
import { RateLimiter } from "../../common/rate-limiter";
import { PROFILE_ROLES } from "../../shared/profile-role";
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
  ) {}

  @Post("login")
  async login(@Body() input: LoginDto, @Ip() ip: string) {
    if (!this.attempts.allow(ip)) {
      throw new HttpException("Demasiados intentos. Espera unos minutos e inténtalo de nuevo.", HttpStatus.TOO_MANY_REQUESTS);
    }

    const adminEmail = this.config.get<string>("app.adminEmail", "admin@inti.local");
    const adminPassword = this.config.get<string>("app.adminPassword", "");

    if (!adminPassword || input.email.toLowerCase() !== adminEmail.toLowerCase() || !matchesSecret(input.password, adminPassword)) {
      throw new UnauthorizedException("Correo o contraseña incorrectos.");
    }

    const { token, expiresAt } = await this.tokens.sign(adminEmail.toLowerCase(), PROFILE_ROLES.ADMINISTRATOR);
    return { authenticated: true, role: PROFILE_ROLES.ADMINISTRATOR, name: "Administrador", email: adminEmail, token, expiresAt };
  }
}
