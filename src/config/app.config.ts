import { registerAs } from "@nestjs/config";

export default registerAs("app", () => ({
  port: Number.parseInt(process.env.API_PORT ?? "3001", 10),
}));
