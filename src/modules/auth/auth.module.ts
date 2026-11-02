import { Logger, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtModule } from "@nestjs/jwt";
import { randomBytes } from "node:crypto";
import { AdminGuard } from "./admin.guard";
import { AuthController } from "./auth.controller";
import { AuthTokenService, TOKEN_ALGORITHM, TOKEN_TTL } from "./auth-token.service";

const MIN_SECRET_LENGTH = 32;

@Module({
  imports: [
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const configured = config.get<string>("app.authSecret", "");
        if (configured.length >= MIN_SECRET_LENGTH) {
          return { secret: configured, signOptions: { algorithm: TOKEN_ALGORITHM, expiresIn: TOKEN_TTL } };
        }
        new Logger("AuthModule").warn(`AUTH_SECRET no está configurado (mínimo ${MIN_SECRET_LENGTH} caracteres); las sesiones se invalidarán al reiniciar.`);
        return { secret: randomBytes(32).toString("hex"), signOptions: { algorithm: TOKEN_ALGORITHM, expiresIn: TOKEN_TTL } };
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthTokenService, AdminGuard],
  exports: [AuthTokenService, AdminGuard],
})
export class AuthModule {}
