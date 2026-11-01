import { Body, Controller, Post, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { timingSafeEqual } from "node:crypto";
import { LoginDto } from "./login.dto";

function matchesSecret(candidate: string, expected: string): boolean {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
}

@Controller("auth")
export class AuthController {
  constructor(private readonly config: ConfigService) {}

  @Post("login")
  login(@Body() input: LoginDto) {
    const adminEmail = this.config.get<string>("app.adminEmail", "admin@inti.local");
    const adminPassword = this.config.get<string>("app.adminPassword", "");

    if (!adminPassword || input.email.toLowerCase() !== adminEmail.toLowerCase() || !matchesSecret(input.password, adminPassword)) {
      throw new UnauthorizedException("Correo o contraseña incorrectos.");
    }

    return { authenticated: true, role: "ADMINISTRATOR", name: "Administrador", email: adminEmail };
  }
}
