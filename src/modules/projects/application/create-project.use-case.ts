import { Inject, Injectable } from "@nestjs/common";
import { PROJECT_REPOSITORY, type Project, type ProjectInput, type ProjectRepository } from "../domain/project";
import { normalizeProjectInput } from "./project-rules";

@Injectable()
export class CreateProjectUseCase {
  constructor(@Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository) {}

  execute(input: ProjectInput): Promise<Project> {
    return this.projects.create(normalizeProjectInput(input));
  }
}
