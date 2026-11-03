import { Body, Controller, Delete, Get, HttpCode, HttpException, HttpStatus, Ip, Param, Patch, Post, Put, Query, Req, UseFilters, UseGuards } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { RateLimiter } from "../../../common/rate-limiter";
import { PrismaService } from "../../../infrastructure/persistence/prisma.service";
import { AdminGuard, readBearerToken, type RequestWithAuthorization } from "../../auth/admin.guard";
import { AuthTokenService } from "../../auth/auth-token.service";
import { MemberGuard } from "../../auth/member.guard";
import { AuthenticatedRequest, SessionGuard } from "../../auth/session.guard";
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
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private async viewer(request: RequestWithAuthorization): Promise<{ isAdmin: boolean; userId?: string }> {
    const payload = await this.tokens.verify(readBearerToken(request));
    if (!payload) return { isAdmin: false };

    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, role: true, isActive: true },
    }) ?? await this.prisma.user.findUnique({
      where: { email: payload.sub.trim().toLowerCase() },
      select: { id: true, role: true, isActive: true },
    });
    if (user) {
      return user.isActive ? { isAdmin: user.role === "ADMINISTRATOR", userId: user.id } : { isAdmin: false };
    }

    const adminEmail = this.config.get<string>("app.adminEmail", "admin@inti.local").toLowerCase();
    const isAdmin = payload.role === "ADMINISTRATOR" && payload.sub.toLowerCase() === adminEmail;
    return { isAdmin, userId: isAdmin ? payload.sub : undefined };
  }

  // Las rutas fijas van antes que las dinámicas (:slug, :id) para que no se confundan.

  @Get()
  async list(@Query() filters: ListProjectsQuery) {
    const page = await this.listProjects.execute(filters);
    return { ...page, items: page.items.map(({ ownerId: _ownerId, ...item }) => item) };
  }

  @Get("admin/all")
  @UseGuards(SessionGuard, AdminGuard)
  listAll(@Query() filters: ListProjectsQuery) {
    return this.listProjects.execute(filters, true);
  }

  @Get("mine")
  @UseGuards(SessionGuard)
  listMine(@Query() filters: ListProjectsQuery, @Req() request: AuthenticatedRequest) {
    return this.listProjects.execute(filters, true, request.auth.id);
  }

  @Get("admin/:id")
  @UseGuards(SessionGuard, AdminGuard)
  getForEdit(@Param("id") id: string) {
    return this.getProject.byId(id);
  }

  @Get("mine/:id")
  @UseGuards(SessionGuard)
  getMineForEdit(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    return this.getProject.byId(id, request.auth.id);
  }

  @Patch("units/:unitId")
  @UseGuards(SessionGuard, MemberGuard)
  updateUnit(@Param("unitId") unitId: string, @Body() changes: UpdateProjectUnitDto, @Req() request: AuthenticatedRequest) {
    return this.units.update(unitId, changes, this.ownerId(request));
  }

  @Delete("units/:unitId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard, MemberGuard)
  removeUnit(@Param("unitId") unitId: string, @Req() request: AuthenticatedRequest) {
    return this.units.remove(unitId, this.ownerId(request));
  }

  @Delete("comments/:commentId")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  removeComment(@Param("commentId") commentId: string, @Req() request: AuthenticatedRequest) {
    return this.comments.remove(commentId, this.ownerId(request));
  }

  @Get(":slug")
  async detail(@Param("slug") slug: string, @Req() request: RequestWithAuthorization) {
    const viewer = await this.viewer(request);
    const project = await this.getProject.bySlug(slug, viewer.isAdmin, viewer.userId);
    if (!viewer.isAdmin && project.ownerId !== viewer.userId) {
      const { ownerId: _ownerId, ...publicProject } = project;
      return publicProject;
    }
    return project;
  }

  @Post()
  @UseGuards(SessionGuard, MemberGuard)
  create(@Body() input: ProjectDto, @Req() request: AuthenticatedRequest) {
    return this.createProject.execute(input, request.auth.id);
  }

  @Put(":id")
  @UseGuards(SessionGuard, MemberGuard)
  update(@Param("id") id: string, @Body() input: ProjectDto, @Req() request: AuthenticatedRequest) {
    return this.updateProject.execute(id, input, this.ownerId(request));
  }

  @Patch(":id/status")
  @UseGuards(SessionGuard, MemberGuard)
  setStatus(@Param("id") id: string, @Body() input: ChangeProjectStatusDto, @Req() request: AuthenticatedRequest) {
    return this.changeStatus.execute(id, input.status, this.ownerId(request));
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  remove(@Param("id") id: string, @Query() query: DeleteProjectQuery, @Req() request: AuthenticatedRequest) {
    return this.deleteProject.execute(id, query.force === "true", this.ownerId(request));
  }

  @Post(":id/units")
  @UseGuards(SessionGuard, MemberGuard)
  addUnit(@Param("id") id: string, @Body() unit: ProjectUnitDto, @Req() request: AuthenticatedRequest) {
    return this.units.add(id, unit, this.ownerId(request));
  }

  @Get(":id/comments")
  async listComments(@Param("id") id: string, @Req() request: RequestWithAuthorization) {
    return this.comments.list(id, (await this.viewer(request)).isAdmin);
  }

  @Post(":id/comments")
  addComment(@Param("id") id: string, @Body() input: CreateProjectCommentDto, @Ip() ip: string) {
    if (!this.commentAttempts.allow(ip)) {
      throw new HttpException("Estás comentando muy rápido. Espera un minuto e inténtalo de nuevo.", HttpStatus.TOO_MANY_REQUESTS);
    }
    return this.comments.add(id, input.authorName, input.content);
  }

  private ownerId(request: AuthenticatedRequest): string | undefined {
    return request.auth.role === "ADMINISTRATOR" ? undefined : request.auth.id;
  }
}
