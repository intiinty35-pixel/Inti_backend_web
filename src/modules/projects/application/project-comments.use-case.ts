import { Inject, Injectable } from "@nestjs/common";
import { PROJECT_REPOSITORY, type ProjectComment, type ProjectRepository } from "../domain/project";
import { ProjectNotFoundError, ProjectValidationError } from "../domain/project.errors";

@Injectable()
export class ProjectCommentsUseCase {
  constructor(@Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository) {}

  async list(projectId: string, isAdmin: boolean): Promise<ProjectComment[]> {
    await this.requireVisibleProject(projectId, isAdmin);
    return this.projects.listComments(projectId);
  }

  async add(projectId: string, authorName: string, content: string): Promise<ProjectComment> {
    await this.requireVisibleProject(projectId, false);
    const name = authorName.replace(/\s+/g, " ").trim();
    const text = content.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (!name || !text) throw new ProjectValidationError("Escribe tu nombre y un comentario.");
    return this.projects.addComment(projectId, name, text);
  }

  async remove(commentId: string): Promise<void> {
    if (!(await this.projects.deleteComment(commentId))) throw ProjectNotFoundError.comment();
  }

  private async requireVisibleProject(projectId: string, isAdmin: boolean): Promise<void> {
    const project = await this.projects.findById(projectId);
    if (!project || (project.status !== "PUBLISHED" && !isAdmin)) throw ProjectNotFoundError.project();
  }
}
