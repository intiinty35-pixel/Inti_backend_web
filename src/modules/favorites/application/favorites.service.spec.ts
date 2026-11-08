import type { PrismaService } from "../../../infrastructure/persistence/prisma.service";
import type { NotificationsService } from "../../notifications/application/notifications.service";
import { FavoritesService } from "./favorites.service";

function setup(options: { existing?: unknown; property?: unknown } = {}) {
  const db = {
    favorite: {
      findUnique: jest.fn().mockResolvedValue(options.existing ?? null),
      create: jest.fn().mockResolvedValue({}),
      delete: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([]),
    },
    property: { findMany: jest.fn().mockResolvedValue([]), findUnique: jest.fn().mockResolvedValue("property" in options ? options.property : { id: "p1", ownerId: "owner", title: "Casa", status: "PUBLISHED" }) },
    project: { findUnique: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]) },
  };
  const notifications = { notify: jest.fn().mockResolvedValue(undefined) };
  return { db, notifications, service: new FavoritesService(db as unknown as PrismaService, notifications as unknown as NotificationsService) };
}

it("adds a favorite and notifies the owner", async () => {
  const { db, notifications, service } = setup();
  const result = await service.toggle("visitor", "PROPERTY", "p1");
  expect(db.favorite.create).toHaveBeenCalledWith({ data: { userId: "visitor", listingType: "PROPERTY", listingId: "p1" } });
  expect(notifications.notify).toHaveBeenCalledWith(expect.objectContaining({ userId: "owner", actorId: "visitor", type: "FAVORITE_ADDED", entityId: "p1" }));
  expect(result).toEqual({ isFavorite: true, count: 1 });
});

it("removes an existing favorite without notifying anyone", async () => {
  const { db, notifications, service } = setup({ existing: { id: "f1" } });
  const result = await service.toggle("visitor", "PROPERTY", "p1");
  expect(db.favorite.delete).toHaveBeenCalledWith({ where: { id: "f1" } });
  expect(notifications.notify).not.toHaveBeenCalled();
  expect(result.isFavorite).toBe(false);
});

it("rejects saving a listing that is not published", async () => {
  const { db, service } = setup({ property: { id: "p1", ownerId: "owner", title: "Casa", status: "DRAFT" } });
  await expect(service.toggle("visitor", "PROPERTY", "p1")).rejects.toThrow("La propiedad no está disponible");
  expect(db.favorite.create).not.toHaveBeenCalled();
});

it("rejects saving a listing that does not exist", async () => {
  const { service } = setup({ property: null });
  await expect(service.toggle("visitor", "PROPERTY", "missing")).rejects.toThrow("La propiedad no está disponible");
});

it("groups the saved ids by listing type", async () => {
  const { db, service } = setup();
  db.favorite.findMany.mockResolvedValue([
    { listingType: "PROPERTY", listingId: "p1" },
    { listingType: "PROJECT", listingId: "j1" },
  ]);
  expect(await service.ids("visitor")).toEqual({ properties: ["p1"], projects: ["j1"] });
});

it("keeps showing a saved listing that was deleted, without a link", async () => {
  const { db, service } = setup();
  db.favorite.findMany.mockResolvedValue([{ id: "f1", userId: "visitor", listingType: "PROPERTY", listingId: "gone", createdAt: new Date() }]);
  const [item] = await service.list("visitor");
  expect(item).toMatchObject({ available: false, href: null, title: "Publicación eliminada" });
});
