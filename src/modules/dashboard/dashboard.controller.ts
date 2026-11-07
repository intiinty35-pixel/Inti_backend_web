import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { PrismaService } from "../../infrastructure/persistence/prisma.service";
import { AdminGuard } from "../auth/admin.guard";
import { SessionGuard, type AuthenticatedRequest } from "../auth/session.guard";

type MonthPoint = { label: string; value: number };

@Controller("dashboard")
@UseGuards(SessionGuard)
export class DashboardController {
  constructor(private readonly prisma: PrismaService) {}

  @Get("metrics")
  @UseGuards(AdminGuard)
  async metrics() {
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    monthStart.setUTCMonth(monthStart.getUTCMonth() - 5);
    // La conexión de Supabase puede estar limitada a una sola. Ejecutar en paralelo
    // bloquea el pool y produce P2024 al cargar el dashboard.
    const users = await this.prisma.user.count({ where: { isActive: true } });
    const properties = await this.prisma.property.count();
    const projects = await this.prisma.project.count();
    const inquiries = await this.prisma.inquiry.count();
    const userRoles = await this.prisma.user.groupBy({ by: ["role"], orderBy: { role: "asc" }, _count: { _all: true } });
    const propertyOperations = await this.prisma.property.groupBy({ by: ["operationType"], orderBy: { operationType: "asc" }, _count: { _all: true } });
    const propertyStatuses = await this.prisma.property.groupBy({ by: ["status"], orderBy: { status: "asc" }, _count: { _all: true } });
    const projectStatuses = await this.prisma.project.groupBy({ by: ["status"], orderBy: { status: "asc" }, _count: { _all: true } });
    const newUsers = await this.prisma.user.findMany({ where: { createdAt: { gte: monthStart } }, select: { createdAt: true } });
    const loginEvents = await this.prisma.loginEvent.findMany({
      where: { createdAt: { gte: monthStart } },
      select: { userId: true, createdAt: true },
    });
    const newInquiries = await this.prisma.inquiry.findMany({ where: { createdAt: { gte: monthStart } }, select: { createdAt: true } });

    const months = this.monthLabels(monthStart);
    const newUsersByMonth = this.monthSeries(months, newUsers);
    const recurringUsersByMonth = this.recurringSeries(months, loginEvents);
    const inquiriesByMonth = this.monthSeries(months, newInquiries);

    return {
      totals: { users, properties, projects, inquiries },
      usersByRole: userRoles.map(({ role, _count }) => ({ label: role, value: _count._all })),
      propertiesByOperation: propertyOperations.map(({ operationType, _count }) => ({ label: operationType, value: _count._all })),
      propertiesByStatus: propertyStatuses.map(({ status, _count }) => ({ label: status, value: _count._all })),
      projectsByStatus: projectStatuses.map(({ status, _count }) => ({ label: status, value: _count._all })),
      newUsersByMonth,
      recurringUsersByMonth,
      inquiriesByMonth,
    };
  }

  @Get("me")
  async myMetrics(@Req() request: AuthenticatedRequest) {
    const ownerId = request.auth.id;
    const monthStart = new Date();
    monthStart.setUTCDate(1);
    monthStart.setUTCHours(0, 0, 0, 0);
    monthStart.setUTCMonth(monthStart.getUTCMonth() - 5);
    const properties = await this.prisma.property.count({ where: { ownerId } });
    const projects = await this.prisma.project.count({ where: { ownerId } });
    const inquiries = await this.prisma.inquiry.count({ where: { ownerId } });
    const unreadInquiries = await this.prisma.inquiry.count({ where: { ownerId, status: "NEW" } });
    const propertyStatuses = await this.prisma.property.groupBy({ by: ["status"], where: { ownerId }, orderBy: { status: "asc" }, _count: { _all: true } });
    const projectStatuses = await this.prisma.project.groupBy({ by: ["status"], where: { ownerId }, orderBy: { status: "asc" }, _count: { _all: true } });
    const propertiesByOperation = await this.prisma.property.groupBy({ by: ["operationType"], where: { ownerId }, orderBy: { operationType: "asc" }, _count: { _all: true } });
    const recentInquiries = await this.prisma.inquiry.findMany({
      where: { ownerId },
      orderBy: { createdAt: "desc" },
      take: 6,
      select: { id: true, listingType: true, listingId: true, senderName: true, senderEmail: true, senderPhone: true, message: true, status: true, createdAt: true },
    });
    const projectViews = await this.prisma.project.aggregate({ where: { ownerId }, _sum: { viewsCount: true } });
    const myInquiries = await this.prisma.inquiry.findMany({ where: { ownerId, createdAt: { gte: monthStart } }, select: { createdAt: true } });
    const months = this.monthLabels(monthStart);
    const propertyIds = recentInquiries.filter((item) => item.listingType === "PROPERTY").map((item) => item.listingId);
    const projectIds = recentInquiries.filter((item) => item.listingType === "PROJECT").map((item) => item.listingId);
    const propertyNames = await this.prisma.property.findMany({ where: { id: { in: propertyIds } }, select: { id: true, title: true } });
    const projectNames = await this.prisma.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, name: true } });
    const listingNames = new Map([
      ...propertyNames.map((item) => [item.id, item.title] as const),
      ...projectNames.map((item) => [item.id, item.name] as const),
    ]);
    return {
      role: request.auth.role,
      totals: {
        properties,
        projects,
        inquiries,
        unreadInquiries,
        projectViews: projectViews._sum.viewsCount ?? 0,
      },
      propertiesByStatus: propertyStatuses.map(({ status, _count }) => ({ label: status, value: _count._all })),
      projectsByStatus: projectStatuses.map(({ status, _count }) => ({ label: status, value: _count._all })),
      propertiesByOperation: propertiesByOperation.map(({ operationType, _count }) => ({ label: operationType, value: _count._all })),
      inquiriesByMonth: this.monthSeries(months, myInquiries),
      recentInquiries: recentInquiries.map((item) => ({
        ...item,
        listingName: listingNames.get(item.listingId) ?? "Publicación eliminada",
        createdAt: item.createdAt.toISOString(),
      })),
    };
  }

  private monthLabels(monthStart: Date): string[] {
    const months: string[] = [];
    for (let offset = 0; offset < 6; offset++) {
      const month = new Date(Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + offset, 1));
      months.push(month.toISOString().slice(0, 7));
    }
    return months;
  }

  private monthSeries(months: string[], items: Array<{ createdAt: Date }>): MonthPoint[] {
    const counts = new Map(months.map((month) => [month, 0]));
    for (const item of items) {
      const month = item.createdAt.toISOString().slice(0, 7);
      if (counts.has(month)) counts.set(month, (counts.get(month) ?? 0) + 1);
    }
    return Array.from(counts, ([label, value]) => ({ label, value }));
  }

  private recurringSeries(months: string[], loginEvents: Array<{ userId: string; createdAt: Date }>): MonthPoint[] {
    const loginsByMonthAndUser = new Map<string, number>();
    for (const event of loginEvents) {
      const month = event.createdAt.toISOString().slice(0, 7);
      const key = `${month}:${event.userId}`;
      loginsByMonthAndUser.set(key, (loginsByMonthAndUser.get(key) ?? 0) + 1);
    }
    const recurring = new Map(months.map((month) => [month, 0]));
    for (const [key, count] of loginsByMonthAndUser) {
      if (count >= 2) {
        const month = key.slice(0, 7);
        recurring.set(month, (recurring.get(month) ?? 0) + 1);
      }
    }
    return Array.from(recurring, ([label, value]) => ({ label, value }));
  }
}
