import { PropertyReviewsController } from "./property-reviews.controller";
import type { PrismaService } from "../../../infrastructure/persistence/prisma.service";
import type { AuthenticatedRequest } from "../../auth/session.guard";

const request = { auth: { id: "visitor" } } as AuthenticatedRequest;
function setup(ownerId = "owner") {
  const db = {
    property: { findFirst: jest.fn().mockResolvedValue({ id: "property", ownerId }) },
    user: { findUnique: jest.fn().mockResolvedValue({ id: "visitor" }) },
    propertyReview: {
      count: jest.fn().mockResolvedValue(1),
      aggregate: jest.fn().mockResolvedValue({ _avg: { rating: 4 }, _count: { _all: 1 } }),
      findMany: jest.fn().mockResolvedValue([{ id: "review", rating: 4, comment: "Bien", user: { name: "Visitante" } }]),
      upsert: jest.fn().mockResolvedValue({}),
    },
  };
  return { db, controller: new PropertyReviewsController(db as unknown as PrismaService) };
}

it("rejects reviews on the owner's property", async () => {
  const { db, controller } = setup("visitor");
  await expect(controller.save("property", { rating: 5, comment: "Bien" }, request)).rejects.toThrow("No puedes valorar tu propia propiedad");
  expect(db.propertyReview.upsert).not.toHaveBeenCalled();
});

it("updates a single review per user and property", async () => {
  const { db, controller } = setup();
  const result = await controller.save("property", { rating: 4, comment: "Bien" }, request);
  expect(db.propertyReview.upsert).toHaveBeenCalledWith(expect.objectContaining({
    where: { propertyId_userId: { propertyId: "property", userId: "visitor" } },
    update: { rating: 4, comment: "Bien" },
  }));
  expect(result.items[0]).toEqual(expect.objectContaining({ authorName: "Visitante" }));
  expect(result.items[0]).not.toHaveProperty("user");
});

it("does not expose reviews on draft properties", async () => {
  const { db, controller } = setup();
  db.property.findFirst.mockResolvedValue(null);
  await expect(controller.list("property")).rejects.toThrow("No se encontró la propiedad publicada");
  expect(db.propertyReview.findMany).not.toHaveBeenCalled();
});

it("saves stars without requiring a comment and keeps existing comments on rating updates", async () => {
  const { db, controller } = setup();
  const result = await controller.save("property", { rating: 5 }, request);
  expect(db.propertyReview.upsert).toHaveBeenCalledWith(expect.objectContaining({
    where: { propertyId_userId: { propertyId: "property", userId: "visitor" } },
    create: { propertyId: "property", userId: "visitor", rating: 5, comment: "" },
    update: { rating: 5, comment: undefined },
  }));
  expect(result.averageRating).toBe(4);
  expect(result.reviewsCount).toBe(1);
  expect(result.commentsCount).toBe(1);
  expect(db.propertyReview.count).toHaveBeenCalledWith({ where: { propertyId: "property", comment: { not: "" } } });
});

it("paginates written comments four at a time without including star-only reviews", async () => {
  const { db, controller } = setup();
  db.propertyReview.count.mockResolvedValue(9);
  const result = await controller.list("property", { page: 2, pageSize: 4, commentsOnly: "true" });
  expect(db.propertyReview.findMany).toHaveBeenCalledWith(expect.objectContaining({
    where: { propertyId: "property", comment: { not: "" } }, skip: 4, take: 4,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
  }));
  expect(result).toEqual(expect.objectContaining({ page: 2, pageSize: 4, total: 9 }));
});
