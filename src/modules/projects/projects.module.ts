import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module";
import { ChangeProjectStatusUseCase } from "./application/change-project-status.use-case";
import { CreateProjectUseCase } from "./application/create-project.use-case";
import { DeleteProjectUseCase } from "./application/delete-project.use-case";
import { GetProjectUseCase } from "./application/get-project.use-case";
import { ListProjectsUseCase } from "./application/list-projects.use-case";
import { ManageProjectUnitsUseCase } from "./application/manage-project-units.use-case";
import { ProjectCommentsUseCase } from "./application/project-comments.use-case";
import { UpdateProjectUseCase } from "./application/update-project.use-case";
import { PROJECT_REPOSITORY } from "./domain/project";
import { PrismaProjectRepository } from "./infrastructure/prisma-project.repository";
import { ProjectMediaController } from "./presentation/project-media.controller";
import { ProjectsController } from "./presentation/projects.controller";

@Module({
  imports: [AuthModule],
  controllers: [ProjectMediaController, ProjectsController],
  providers: [
    CreateProjectUseCase,
    UpdateProjectUseCase,
    DeleteProjectUseCase,
    ChangeProjectStatusUseCase,
    ListProjectsUseCase,
    GetProjectUseCase,
    ManageProjectUnitsUseCase,
    ProjectCommentsUseCase,
    PrismaProjectRepository,
    { provide: PROJECT_REPOSITORY, useExisting: PrismaProjectRepository },
  ],
})
export class ProjectsModule {}
