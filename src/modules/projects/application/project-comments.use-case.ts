import { Inject, Injectable, Optional } from "@nestjs/common";
import { NotificationsService } from "../../notifications/application/notifications.service";
import { PROJECT_REPOSITORY, type ProjectComment, type ProjectRepository } from "../domain/project";
import { ProjectNotFoundError, ProjectValidationError } from "../domain/project.errors";

@Injectable()
export class ProjectCommentsUseCase {
  constructor(
    @Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  async list(projectId: string, isAdmin: boolean): Promise<ProjectComment[]> {
    await this.requireVisibleProject(projectId, isAdmin);
    return this.projects.listComments(projectId);
  }

  async add(projectId: string, authorName: string, content: string): Promise<ProjectComment> {
    const project = await this.requireVisibleProject(projectId, false);
    const name = authorName.replace(/\s+/g, " ").trim();
    const text = content.replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
    if (!name || !text) throw new ProjectValidationError("Escribe tu nombre y un comentario.");
    const comment = await this.projects.addComment(projectId, name, text);
    await this.notifications?.notify({
      userId: project.ownerId,
      type: "PROJECT_COMMENT",
      title: "Nuevo comentario",
      message: `${name} comentó en «${project.name}».`,
      actionUrl: `/proyectos/${project.slug}`,
      entityType: "PROJECT",
      entityId: projectId,
    });
    return comment;
  }

  async remove(commentId: string, ownerId?: string): Promise<void> {
    if (!(await this.projects.deleteComment(commentId, ownerId))) throw ProjectNotFoundError.comment();
  }

  private async requireVisibleProject(projectId: string, isAdmin: boolean) {
    const project = await this.projects.findById(projectId);
    if (!project || (project.status !== "PUBLISHED" && !isAdmin)) throw ProjectNotFoundError.project();
    return project;
  }
}
