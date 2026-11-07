import { Logger, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import helmet from "helmet";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>("app.port", 3001);

  // Detrás de Nginx todas las peticiones llegan desde el proxy: sin esto, los límites de intentos se compartirían entre todos los visitantes.
  app.set("trust proxy", config.get<number>("app.trustProxyHops", 0));
  // La API no sirve HTML, así que la política de contenido no aporta nada.
  app.use(helmet({ contentSecurityPolicy: false }));
  app.setGlobalPrefix("api");
  const allowedOrigins = new Set(config.get<string[]>("app.allowedOrigins", ["http://localhost:3000"]));
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) return callback(null, true);
      if (process.env.NODE_ENV !== "production") {
        try {
          const hostname = new URL(origin).hostname;
          if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]") return callback(null, true);
        } catch {
          return callback(null, false);
        }
      }
      return callback(null, false);
    },
  });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  // Permite que Docker detenga el contenedor cerrando la conexión a la base de datos.
  app.enableShutdownHooks();

  await app.listen(port, "0.0.0.0");
  new Logger("Bootstrap").log(`Servidor escuchando en el puerto ${port}`);
}

void bootstrap();
