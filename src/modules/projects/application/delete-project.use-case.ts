import { Inject, Injectable } from "@nestjs/common";
import { PROJECT_REPOSITORY, type ProjectRepository } from "../domain/project";
import { ProjectConflictError, ProjectNotFoundError } from "../domain/project.errors";
import { ImageStorage } from "../../../shared/image-storage";

@Injectable()
export class DeleteProjectUseCase {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    private readonly images: ImageStorage,
  ) {}

  /** Un proyecto con unidades vendidas solo se elimina con confirmación explícita (`force`). */
  async execute(id: string, force: boolean, ownerId?: string): Promise<void> {
    const project = ownerId ? await this.projects.findById(id, ownerId) : await this.projects.findById(id);
    if (!project) throw ProjectNotFoundError.project();
    if (project.stats.soldUnits > 0 && !force) {
      throw new ProjectConflictError(`El proyecto tiene ${project.stats.soldUnits} unidad(es) vendida(s). Confirma la eliminación para borrarlo de todos modos.`);
    }
    const removed = ownerId ? await this.projects.delete(id, ownerId) : await this.projects.delete(id);
    if (removed) await this.images.remove(removed.publicIds);
  }
}
