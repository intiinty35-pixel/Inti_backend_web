import { NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../../infrastructure/persistence/prisma.service";
import { InquiriesService } from "./inquiries.service";

describe("InquiriesService", () => {
  const prisma = {
    inquiry: {
      findMany: jest.fn(),
      findFirst: jest.fn(),
      updateMany: jest.fn(),
    },
    property: { findMany: jest.fn() },
    project: { findMany: jest.fn() },
  };
  const service = new InquiriesService(prisma as unknown as PrismaService);

  beforeEach(() => jest.clearAllMocks());

  it("lists the owner's inquiries with their listing names", async () => {
    prisma.inquiry.findMany.mockResolvedValue([
      { id: "inquiry-1", listingType: "PROPERTY", listingId: "property-1", status: "NEW" },
      { id: "inquiry-2", listingType: "PROJECT", listingId: "project-1", status: "READ" },
    ]);
    prisma.property.findMany.mockResolvedValue([{ id: "property-1", title: "Casa en Equipetrol" }]);
    prisma.project.findMany.mockResolvedValue([{ id: "project-1", name: "Torres Inti" }]);

    await expect(service.listMine("owner-1")).resolves.toEqual([
      { id: "inquiry-1", listingType: "PROPERTY", listingId: "property-1", status: "NEW", listingName: "Casa en Equipetrol" },
      { id: "inquiry-2", listingType: "PROJECT", listingId: "project-1", status: "READ", listingName: "Torres Inti" },
    ]);
    expect(prisma.inquiry.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { ownerId: "owner-1" } }));
  });

  it("marks a consultation read only within the authenticated owner's inbox", async () => {
    prisma.inquiry.updateMany.mockResolvedValue({ count: 1 });
    prisma.inquiry.findFirst.mockResolvedValue({ id: "inquiry-1", ownerId: "owner-1", status: "READ" });

    await expect(service.setReadStatus("inquiry-1", "owner-1", true)).resolves.toMatchObject({ status: "READ" });
    expect(prisma.inquiry.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "inquiry-1", ownerId: "owner-1" },
      data: expect.objectContaining({ status: "READ", readAt: expect.any(Date) }),
    }));
  });

  it("does not let a different account read or update another owner's consultation", async () => {
    prisma.inquiry.updateMany.mockResolvedValue({ count: 0 });
    prisma.inquiry.findFirst.mockResolvedValue(null);

    await expect(service.setReadStatus("inquiry-1", "owner-2", true)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.inquiry.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "inquiry-1", ownerId: "owner-2" } }));
  });
});
