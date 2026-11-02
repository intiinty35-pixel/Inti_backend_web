import { Inject, Injectable } from "@nestjs/common";
import { PROJECT_REPOSITORY, type Project, type ProjectInput, type ProjectRepository } from "../domain/project";
import { ProjectNotFoundError } from "../domain/project.errors";
import { ProjectFileStorage } from "../infrastructure/project-file-storage";
import { normalizeProjectInput } from "./project-rules";

@Injectable()
export class UpdateProjectUseCase {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    private readonly files: ProjectFileStorage,
  ) {}

  async execute(id: string, input: ProjectInput, ownerId?: string): Promise<Project> {
    const result = await this.projects.update(id, normalizeProjectInput(input), ownerId);
    if (!result) throw ProjectNotFoundError.project();
    await this.files.remove(result.removedPublicIds);
    return result.project;
  }
}
