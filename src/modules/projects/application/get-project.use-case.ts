import { Inject, Injectable } from "@nestjs/common";
import { PROJECT_REPOSITORY, type Project, type ProjectRepository } from "../domain/project";
import { ProjectNotFoundError } from "../domain/project.errors";

@Injectable()
export class GetProjectUseCase {
  constructor(@Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository) {}

  /** Los visitantes solo ven proyectos publicados; el administrador puede previsualizar cualquier estado. */
  async bySlug(slug: string, isAdmin: boolean): Promise<Project> {
    const project = await this.projects.findBySlug(slug);
    if (!project || (project.status !== "PUBLISHED" && !isAdmin)) throw ProjectNotFoundError.project();
    if (!isAdmin) {
      await this.projects.incrementViews(project.id);
      project.viewsCount += 1;
    }
    return project;
  }

  async byId(id: string, ownerId?: string): Promise<Project> {
    const project = await this.projects.findById(id, ownerId);
    if (!project) throw ProjectNotFoundError.project();
    return project;
  }
}
