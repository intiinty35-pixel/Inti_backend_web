import type { PrismaService } from "../../../infrastructure/persistence/prisma.service";
import { NotificationsService } from "./notifications.service";

function setup(overrides: { repeated?: unknown; user?: unknown } = {}) {
  const db = {
    user: { findUnique: jest.fn().mockResolvedValue("user" in overrides ? overrides.user : { id: "owner" }) },
    notification: {
      findFirst: jest.fn().mockResolvedValue(overrides.repeated ?? null),
      create: jest.fn().mockResolvedValue({}),
      count: jest.fn().mockResolvedValue(2),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      findMany: jest.fn().mockResolvedValue([]),
    },
  };
  return { db, service: new NotificationsService(db as unknown as PrismaService) };
}

const base = { type: "FAVORITE_ADDED", title: "Hola", message: "Mensaje" } as const;

it("creates a notification with an expiry date", async () => {
  const { db, service } = setup();
  await service.notify({ ...base, userId: "owner", actorId: "visitor", entityId: "p1" });
  expect(db.notification.create).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "owner", type: "FAVORITE_ADDED", entityId: "p1", expiresAt: expect.any(Date) }) });
});

it("never notifies a person about their own action", async () => {
  const { db, service } = setup();
  await service.notify({ ...base, userId: "same", actorId: "same" });
  expect(db.notification.create).not.toHaveBeenCalled();
});

it("ignores listings without an owner", async () => {
  const { db, service } = setup();
  await service.notify({ ...base, userId: null });
  expect(db.notification.create).not.toHaveBeenCalled();
});

it("skips a repeated notification inside the dedupe window", async () => {
  const { db, service } = setup({ repeated: { id: "old" } });
  await service.notify({ ...base, userId: "owner", entityId: "p1", dedupeHours: 24 });
  expect(db.notification.create).not.toHaveBeenCalled();
});

it("does nothing when the recipient is not a registered user", async () => {
  const { db, service } = setup({ user: null });
  await service.notify({ ...base, userId: "admin@inti.local" });
  expect(db.notification.create).not.toHaveBeenCalled();
});

it("swallows database failures so the original action keeps working", async () => {
  const { db, service } = setup();
  db.notification.create.mockRejectedValue(new Error("db down"));
  await expect(service.notify({ ...base, userId: "owner" })).resolves.toBeUndefined();
});

it("only touches the notifications of the signed-in user", async () => {
  const { db, service } = setup();
  await service.markRead("owner", "n1");
  expect(db.notification.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "n1", userId: "owner", isRead: false } }));
  await service.markAllRead("owner");
  expect(db.notification.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({ where: { userId: "owner", isRead: false } }));
});

it("rejects deleting a notification that belongs to someone else", async () => {
  const { db, service } = setup();
  db.notification.deleteMany.mockResolvedValue({ count: 0 });
  await expect(service.remove("owner", "n9")).rejects.toThrow("No se encontró este aviso");
});
