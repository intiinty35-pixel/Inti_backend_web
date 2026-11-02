/** Errores de negocio del módulo; la capa de presentación decide cómo se traducen a HTTP. */
export abstract class ProjectDomainError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

export class ProjectNotFoundError extends ProjectDomainError {
  static project() {
    return new ProjectNotFoundError("No se encontró el proyecto.");
  }

  static unit() {
    return new ProjectNotFoundError("No se encontró la unidad.");
  }

  static comment() {
    return new ProjectNotFoundError("No se encontró el comentario.");
  }
}

export class ProjectValidationError extends ProjectDomainError {}

export class ProjectConflictError extends ProjectDomainError {}
