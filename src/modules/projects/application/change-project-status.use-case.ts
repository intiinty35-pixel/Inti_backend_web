import { Inject, Injectable } from "@nestjs/common";
import { PROJECT_REPOSITORY, type Project, type ProjectRepository, type ProjectStatus } from "../domain/project";
import { ProjectNotFoundError } from "../domain/project.errors";

@Injectable()
export class ChangeProjectStatusUseCase {
  constructor(@Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository) {}

  async execute(id: string, status: ProjectStatus): Promise<Project> {
    const project = await this.projects.setStatus(id, status);
    if (!project) throw ProjectNotFoundError.project();
    return project;
  }
}
