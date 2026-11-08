import { Body, ConflictException, Controller, Get, NotFoundException, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { IsBoolean, IsEmail, IsIn, IsString, MinLength } from "class-validator";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { PROFILE_ROLES, type ProfileRole } from "../../shared/profile-role";
import { hashPassword } from "../../shared/password-hash";
import { AdminGuard } from "../auth/admin.guard";
import { AuthenticatedRequest, SessionGuard } from "../auth/session.guard";
import { BillingAccountsService } from "../billing/billing-accounts.service";
import { audit } from "../billing/billing.store";

class CreateUserDto {
  @IsString() @MinLength(2) name!: string;
  @IsEmail() email!: string;
  @IsString() @MinLength(8) password!: string;
  @IsIn(Object.values(PROFILE_ROLES)) role!: ProfileRole;
}

class UserStatusDto {
  @IsBoolean() isActive!: boolean;
  @IsString() @MinLength(3) reason!: string;
}

@Controller("users")
@UseGuards(SessionGuard, AdminGuard)
export class UsersController {
  constructor(private readonly prisma: PrismaService, private readonly billingAccounts: BillingAccountsService) {}

  @Get()
  async list() {
    const users = await this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        isActive: true,
        accountStatus: true,
        createdAt: true,
        _count: { select: { properties: true, projects: true } },
      },
      orderBy: { createdAt: "desc" },
    });
    return users.map((user) => ({ ...user, createdAt: user.createdAt.toISOString() }));
  }

  @Post()
  async create(@Body() input: CreateUserDto) {
    try {
      const user = await this.prisma.user.create({
        data: {
          name: input.name.trim(),
          email: input.email.trim().toLowerCase(),
          passwordHash: await hashPassword(input.password),
          role: input.role,
        },
        select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
      });
      return { ...user, createdAt: user.createdAt.toISOString() };
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "P2002") {
        throw new ConflictException("Ya existe una cuenta con ese correo.");
      }
      throw error;
    }
  }

  @Patch(":id/status")
  async setStatus(
    @Param("id") id: string,
    @Body() input: UserStatusDto,
    @Req() request: AuthenticatedRequest,
  ) {
    const target = await this.prisma.user.findUnique({ where: { id } });
    if (!target) throw new NotFoundException("No se encontró el usuario.");
    if (target.role !== PROFILE_ROLES.ADMINISTRATOR) {
      await this.billingAccounts.change(id, request.auth.id, { status: input.isActive ? "ACTIVE" : "INACTIVE", reason: input.reason });
      return this.prisma.user.findUnique({ where: { id }, select: { id: true, name: true, email: true, role: true, isActive: true, accountStatus: true, createdAt: true } });
    }
    if (target.id === request.auth.id && !input.isActive) {
      throw new ConflictException("No puedes desactivar tu propia cuenta.");
    }
    if (target.role === PROFILE_ROLES.ADMINISTRATOR && !input.isActive) {
      const activeAdmins = await this.prisma.user.count({ where: { role: PROFILE_ROLES.ADMINISTRATOR, isActive: true } });
      if (activeAdmins <= 1) throw new ConflictException("Debe quedar al menos un administrador activo.");
    }
    const user = await this.prisma.user.update({
      where: { id },
      data: { isActive: input.isActive },
      select: { id: true, name: true, email: true, role: true, isActive: true, createdAt: true },
    });
    await audit(this.prisma, request.auth.id, id, "ADMIN_ACCOUNT_ACCESS_CHANGED", id, { isActive: target.isActive }, { isActive: user.isActive }, input.reason);
    return { ...user, createdAt: user.createdAt.toISOString() };
  }
}
