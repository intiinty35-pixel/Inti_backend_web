import { ArgumentsHost, Catch, ExceptionFilter, HttpStatus } from "@nestjs/common";
import { STATUS_CODES } from "node:http";
import { ProjectConflictError, ProjectDomainError, ProjectNotFoundError } from "../domain/project.errors";

interface JsonResponse {
  status(code: number): { json(body: unknown): void };
}

/** Traduce los errores de dominio al mismo formato de respuesta que usan las excepciones HTTP de Nest. */
@Catch(ProjectDomainError)
export class ProjectDomainErrorFilter implements ExceptionFilter<ProjectDomainError> {
  catch(error: ProjectDomainError, host: ArgumentsHost): void {
    const statusCode =
      error instanceof ProjectNotFoundError ? HttpStatus.NOT_FOUND : error instanceof ProjectConflictError ? HttpStatus.CONFLICT : HttpStatus.BAD_REQUEST;
    host
      .switchToHttp()
      .getResponse<JsonResponse>()
      .status(statusCode)
      .json({ message: error.message, error: STATUS_CODES[statusCode], statusCode });
  }
}
