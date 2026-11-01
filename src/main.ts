import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);
  const port = config.get<number>("app.port", 3001);

  app.setGlobalPrefix("api");
  app.enableCors({ origin: process.env.FRONTEND_ORIGIN ?? "http://localhost:3000" });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  await app.listen(port, "0.0.0.0");
  console.log(`Server is running on port ${port}`);
}

void bootstrap();
