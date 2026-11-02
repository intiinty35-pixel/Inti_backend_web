import { Injectable } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import type { ProfileRole } from "../../shared/profile-role";
import { PROFILE_ROLES } from "../../shared/profile-role";

export interface AuthTokenPayload {
  sub: string;
  role: ProfileRole;
  exp: number;
}

export const TOKEN_ALGORITHM = "HS256";
export const TOKEN_TTL = "12h";

@Injectable()
export class AuthTokenService {
  constructor(private readonly jwt: JwtService) {}

  async sign(subject: string, role: ProfileRole): Promise<{ token: string; expiresAt: number }> {
    const token = await this.jwt.signAsync({ sub: subject, role });
    const { exp } = this.jwt.decode<{ exp: number }>(token);
    return { token, expiresAt: exp * 1000 };
  }

  async verify(token: string | undefined): Promise<AuthTokenPayload | null> {
    if (!token) return null;
    try {
      return await this.jwt.verifyAsync<AuthTokenPayload>(token, { algorithms: [TOKEN_ALGORITHM] });
    } catch {
      return null;
    }
  }

  async isAdministrator(token: string | undefined): Promise<boolean> {
    return (await this.verify(token))?.role === PROFILE_ROLES.ADMINISTRATOR;
  }
}
