import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Req, UseGuards } from "@nestjs/common";
import { PROFILE_ROLES, type ProfileRole } from "../../../shared/profile-role";
import { AdminGuard } from "../../auth/admin.guard";
import { MemberGuard } from "../../auth/member.guard";
import { AuthenticatedRequest, SessionGuard } from "../../auth/session.guard";
import { CreatePropertyUseCase } from "../application/create-property.use-case";
import { ListPropertiesUseCase } from "../application/list-properties.use-case";
import { CreatePropertyDto } from "./create-property.dto";

@Controller("properties")
export class PropertiesController {
  constructor(
    private readonly createProperty: CreatePropertyUseCase,
    private readonly listProperties: ListPropertiesUseCase,
  ) {}

  @Get()
  async list() {
    const properties = await this.listProperties.execute();
    return properties.map(({ ownerId: _ownerId, ownerName: _ownerName, ownerEmail: _ownerEmail, ...property }) => property);
  }

  @Get("mine")
  @UseGuards(SessionGuard)
  mine(@Req() request: AuthenticatedRequest) {
    return this.listProperties.executeManaged(request.auth.id);
  }

  @Get("admin/all")
  @UseGuards(SessionGuard, AdminGuard)
  allForAdmin() {
    return this.listProperties.executeManaged();
  }

  @Post()
  @UseGuards(SessionGuard, MemberGuard)
  create(@Body() input: CreatePropertyDto, @Req() request: AuthenticatedRequest) {
    return this.createProperty.execute({
      ...input,
      createdByRole: request.auth.role as ProfileRole,
      ownerId: request.auth.id,
    });
  }

  @Delete(":id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionGuard)
  async remove(@Param("id") id: string, @Req() request: AuthenticatedRequest) {
    const ownerId = request.auth.role === PROFILE_ROLES.ADMINISTRATOR ? undefined : request.auth.id;
    await this.listProperties.deleteManaged(id, ownerId);
  }
}
