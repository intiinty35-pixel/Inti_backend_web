import { Body, Controller, Delete, Get, HttpCode, HttpException, HttpStatus, Ip, Param, Patch, Post, Put, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import { RateLimiter } from "../../../common/rate-limiter";
import { AdminGuard, readBearerToken, type RequestWithAuthorization } from "../../auth/admin.guard";
import { AuthTokenService } from "../../auth/auth-token.service";
import { ChangeProjectStatusUseCase } from "../application/change-project-status.use-case";
import { CreateProjectUseCase } from "../application/create-project.use-case";
import { DeleteProjectUseCase } from "../application/delete-project.use-case";
import { GetProjectUseCase } from "../application/get-project.use-case";
import { ListProjectsUseCase } from "../application/list-projects.use-case";
import { ManageProjectUnitsUseCase } from "../application/manage-project-units.use-case";
import { ProjectCommentsUseCase } from "../application/project-comments.use-case";
import { UpdateProjectUseCase } from "../application/update-project.use-case";
import {
  ChangeProjectStatusDto,
  CreateProjectCommentDto,
  DeleteProjectQuery,
  ListProjectsQuery,
  ProjectDto,
  ProjectUnitDto,
  UpdateProjectUnitDto,
} from "./project.dto";
import { ProjectDomainErrorFilter } from "./project-domain-error.filter";

@Controller("projects")
@UseFilters(ProjectDomainErrorFilter)
export class ProjectsController {
  private readonly commentAttempts = new RateLimiter(5, 60 * 1000);

  constructor(
    private readonly tokens: AuthTokenService,
    private readonly createProject: CreateProjectUseCase,
    private readonly updateProject: UpdateProjectUseCase,
    private readonly deleteProject: DeleteProjectUseCase,
    private readonly changeStatus: ChangeProjectStatusUseCase,
    private readonly listProjects: ListProjectsUseCase,
    private readonly getProject: GetProjectUseCase,
    private readonly units: ManageProjectUnitsUseCase,
    private readonly comments: ProjectCommentsUseCase,
  ) {}

  private isAdmin(request: RequestWithAuthorization): Promise<boolean> {
    return this.tokens.isAdministrator(readBearerToken(request));
  }

  // Las rutas fijas van antes que las dinámicas (:slug, :id) para que no se confundan.

  @Get()
  list(@Query() filters: ListProjectsQuery) {
    return this.listProjects.execute(filters);
  }

  @Get("admin/all")
  @UseGuards(AdminGuard)
  listAll(@Query() filters: ListProjectsQuery) {
    return this.listProjects.execute(filters, true);
  }

  @Get("admin/:id")
  @UseGuards(AdminGuard)
  getForEdit(@Param("id") id: string) {
    return this.getProject.byId(id);
  }

  @Patch("units/:unitId")
  @UseGuards(AdminGuard)
  updateUnit(@Param("unitId") unitId: string, @Body() changes: UpdateProjectUnitDto) {
    return this.units.update(unitId, changes);
  }

  @Delete("units/:unitId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AdminGuard)
  removeUnit(@Param("unitId") unitId: string) {
    return this.units.remove(unitId);
  }

  @Delete("comments/:commentId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AdminGuard)
  removeComment(@Param("commentId") commentId: string) {
    return this.comments.remove(commentId);
  }

  @Get(":slug")
  async detail(@Param("slug") slug: string, @Req() request: RequestWithAuthorization) {
    return this.getProject.bySlug(slug, await this.isAdmin(request));
  }

  @Post()
  @UseGuards(AdminGuard)
  create(@Body() input: ProjectDto) {
    return this.createProject.execute(input);
  }

  @Put(":id")
  @UseGuards(AdminGuard)
  update(@Param("id") id: string, @Body() input: ProjectDto) {
    return this.updateProject.execute(id, input);
  }

  @Patch(":id/status")
  @UseGuards(AdminGuard)
  setStatus(@Param("id") id: string, @Body() input: ChangeProjectStatusDto) {
    return this.changeStatus.execute(id, input.status);
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(AdminGuard)
  remove(@Param("id") id: string, @Query() query: DeleteProjectQuery) {
    return this.deleteProject.execute(id, query.force === "true");
  }

  @Post(":id/units")
  @UseGuards(AdminGuard)
  addUnit(@Param("id") id: string, @Body() unit: ProjectUnitDto) {
    return this.units.add(id, unit);
  }

  @Get(":id/comments")
  async listComments(@Param("id") id: string, @Req() request: RequestWithAuthorization) {
    return this.comments.list(id, await this.isAdmin(request));
  }

  @Post(":id/comments")
  addComment(@Param("id") id: string, @Body() input: CreateProjectCommentDto, @Ip() ip: string) {
    if (!this.commentAttempts.allow(ip)) {
      throw new HttpException("Estás comentando muy rápido. Espera un minuto e inténtalo de nuevo.", HttpStatus.TOO_MANY_REQUESTS);
    }
    return this.comments.add(id, input.authorName, input.content);
  }
}
