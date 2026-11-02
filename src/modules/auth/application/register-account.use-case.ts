import { ConflictException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../../infrastructure/persistence/prisma.service";
import { hashPassword } from "../../../shared/password-hash";
import type { RegisterAccountDto } from "../presentation/register-account.dto";

@Injectable()
export class RegisterAccountUseCase {
  constructor(private readonly prisma: PrismaService) {}

  async execute(input: RegisterAccountDto) {
    try {
      const user = await this.prisma.user.create({
        data: {
          name: input.name.trim().replace(/\s+/g, " "),
          email: input.email.trim().toLowerCase(),
          role: input.role,
          passwordHash: await hashPassword(input.password),
        },
        select: { id: true, name: true, email: true, role: true, createdAt: true },
      });
      return { ...user, createdAt: user.createdAt.toISOString() };
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "P2002") {
        throw new ConflictException("Ya existe una cuenta con ese correo.");
      }
      throw error;
    }
  }
}
