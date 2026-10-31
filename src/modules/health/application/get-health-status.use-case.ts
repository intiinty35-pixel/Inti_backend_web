import { Injectable } from "@nestjs/common";

export interface HealthStatus {
  status: "ok";
  service: string;
  timestamp: string;
}

@Injectable()
export class GetHealthStatusUseCase {
  execute(): HealthStatus {
    return {
      status: "ok",
      service: "inti-backend",
      timestamp: new Date().toISOString(),
    };
  }
}
