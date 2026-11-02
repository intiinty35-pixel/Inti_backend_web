import { Controller, Get, UseGuards } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { AdminGuard } from "../auth/admin.guard";
import { SessionGuard } from "../auth/session.guard";

@Controller("dashboard")
@UseGuards(SessionGuard, AdminGuard)
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("metrics")
  async metrics() {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    monthStart.setUTCMonth(monthStart.getUTCMonth() - 5);
    const [users, properties, projects, userRoles, propertyOperations, projectStatuses, newUsers, loginEvents] = await Promise.all([
      this.prisma.user.count({ where: { isActive: true } }),
      this.prisma.property.count(),
      this.prisma.project.count(),
      this.prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
      this.prisma.property.groupBy({ by: ["operationType"], _count: { _all: true } }),
      this.prisma.project.groupBy({ by: ["status"], _count: { _all: true } }),
      this.prisma.user.findMany({ where: { createdAt: { gte: monthStart } }, select: { createdAt: true } }),
      this.prisma.loginEvent.findMany({
        where: { createdAt: { gte: monthStart } },
        select: { userId: true, createdAt: true },
      }),
    ]);

    const months: string[] = [];
    for (let offset = 0; offset < 6; offset++) {
      const month = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + offset, 1));
      months.push(month.toISOString().slice(0, 7));
    }
    const newUsersCounts = new Map(months.map((month) => [month, 0]));
    for (const user of newUsers) {
      const month = user.createdAt.toISOString().slice(0, 7);
      if (newUsersCounts.has(month)) newUsersCounts.set(month, (newUsersCounts.get(month) ?? 0) + 1);
    }

    const loginsByMonthAndUser = new Map<string, number>();
    for (const event of loginEvents) {
      const month = event.createdAt.toISOString().slice(0, 7);
      const key = `${month}:${event.userId}`;
      loginsByMonthAndUser.set(key, (loginsByMonthAndUser.get(key) ?? 0) + 1);
    }
    const recurringUsersCounts = new Map(months.map((month) => [month, 0]));
    for (const [key, count] of loginsByMonthAndUser) {
      if (count >= 2) {
        const month = key.slice(0, 7);
        recurringUsersCounts.set(month, (recurringUsersCounts.get(month) ?? 0) + 1);
      }
    }
    const newUsersByMonth = Array.from(newUsersCounts, ([label, value]) => ({ label, value }));
    const recurringUsersByMonth = Array.from(recurringUsersCounts, ([label, value]) => ({ label, value }));

    return {
      totals: { users, properties, projects },
      usersByRole: userRoles.map(({ role, _count }) => ({ label: role, value: _count._all })),
      propertiesByOperation: propertyOperations.map(({ operationType, _count }) => ({ label: operationType, value: _count._all })),
      projectsByStatus: projectStatuses.map(({ status, _count }) => ({ label: status, value: _count._all })),
      newUsersByMonth,
      recurringUsersByMonth,
    };
  }
}
