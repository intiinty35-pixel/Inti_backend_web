import { Controller, Get } from "@nestjs/common";
import { GetHealthStatusUseCase } from "../application/get-health-status.use-case";

@Controller("health")
export class HealthController {
  constructor(private readonly getHealthStatus: GetHealthStatusUseCase) {}

  @Get()
  check() {
    return this.getHealthStatus.execute();
  }
}
