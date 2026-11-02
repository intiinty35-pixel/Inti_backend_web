import { Inject, Injectable } from "@nestjs/common";
import { PROJECT_REPOSITORY, type Project, type ProjectRepository } from "../domain/project";
import { ProjectNotFoundError } from "../domain/project.errors";

@Injectable()
export class GetProjectUseCase {
  constructor(@Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository) {}

  /** Los visitantes ven publicados; el dueño puede previsualizar su borrador y el administrador cualquiera. */
  async bySlug(slug: string, isAdmin: boolean, ownerId?: string): Promise<Project> {
    const project = await this.projects.findBySlug(slug);
    const isOwner = Boolean(ownerId && project?.ownerId === ownerId);
    if (!project || (project.status !== "PUBLISHED" && !isAdmin && !isOwner)) throw ProjectNotFoundError.project();
    if (!isAdmin && !isOwner) {
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
