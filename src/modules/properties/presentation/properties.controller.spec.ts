import { NotFoundException } from "@nestjs/common";
import { PropertiesController } from "./properties.controller";
import { CreatePropertyUseCase } from "../application/create-property.use-case";
import { ListPropertiesUseCase } from "../application/list-properties.use-case";
import { PrismaService } from "../../../infrastructure/persistence/prisma.service";

describe("public property details", () => {
  const list = { execute: jest.fn() };
  const prisma = { user: { findUnique: jest.fn(), findFirst: jest.fn() }, project: { findMany: jest.fn() }, billingAudit: { findMany: jest.fn() } };
  const controller = new PropertiesController({} as CreatePropertyUseCase, list as unknown as ListPropertiesUseCase, prisma as unknown as PrismaService);
  const published = { id: "p1", slug: "casa-en-la-paz", title: "Casa", status: "PUBLISHED", ownerId: "u1", ownerName: "Agente", ownerEmail: "private@example.com", contactName: "Contacto", createdByRole: "AGENT", location: { district: "Centro", department: "La Paz" } };
  beforeEach(() => { jest.clearAllMocks(); list.execute.mockResolvedValue([published]); prisma.user.findUnique.mockResolvedValue({ name: "Agente", role: "AGENT", createdAt: new Date("2026-01-01T00:00:00Z") }); });
  it("returns only a safe public publisher profile and published listings", async () => {
    const result = await controller.detail("casa-en-la-paz");
    expect(result.title).toBe("Casa");
    expect(result).not.toHaveProperty("ownerId");
    expect(result).not.toHaveProperty("ownerEmail");
    expect(result.publisher).toEqual({ id: "u1", name: "Agente", role: "AGENT", memberSince: "2026-01-01T00:00:00.000Z", publishedProperties: 1, areas: ["Centro, La Paz"] });
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: "u1" }, select: { name: true, role: true, createdAt: true } });
  });
  it("does not expose drafts or unavailable properties", async () => {
    list.execute.mockResolvedValue([{ ...published, status: "DRAFT" }]);
    await expect(controller.detail("p1")).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.detail("missing")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });
  it("supports links by identifier and a missing owner without inventing an account", async () => {
    list.execute.mockResolvedValue([{ ...published, ownerId: undefined, ownerName: undefined }]);
    const result = await controller.detail("p1");
    expect(result.publisher.name).toBe("Contacto");
    expect(result.publisher.memberSince).toBeNull();
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("lists only this publisher's public properties and projects with publication dates", async () => {
    prisma.user.findFirst.mockResolvedValue({ id: "u1", name: "Agente", role: "AGENT", createdAt: new Date("2026-01-01") });
    list.execute.mockResolvedValue([{ ...published, createdAt: "2026-02-01T00:00:00Z", media: [], currency: "BOB", price: 500 }, { ...published, id: "other", ownerId: "u2" }, { ...published, id: "draft", status: "DRAFT" }]);
    prisma.project.findMany.mockResolvedValue([{ id: "project1", slug: "torre", name: "Torre", currency: "USD", district: "Centro", department: "La Paz", createdAt: new Date("2026-03-01"), media: [], units: [] }]);
    prisma.billingAudit.findMany.mockResolvedValue([{ resourceId: "p1", createdAt: new Date("2026-04-01") }]);
    const result = await controller.publisher("u1");
    expect(result.listings.map((item) => item.id)).toEqual(["p1", "project1"]);
    expect(result.listings[0].publishedAt).toBe("2026-04-01T00:00:00.000Z");
    expect(result.listings[1].publishedAt).toBeNull();
    expect(result).not.toHaveProperty("email");
    expect(prisma.project.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ ownerId: "u1", status: "PUBLISHED", subscription: expect.objectContaining({ status: "ACTIVE" }) }) }));
  });

  it("does not publish profiles of inactive or unknown accounts", async () => {
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(controller.publisher("missing")).rejects.toBeInstanceOf(NotFoundException);
  });
});
