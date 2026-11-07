import type { ConfigService } from "@nestjs/config";
import { IMAGE_FOLDERS } from "../../shared/image-storage";
import type { PrismaService } from "../persistence/prisma.service";
import { CloudinaryImageStorage, type CloudinarySdk } from "./cloudinary-image-storage";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const uploader = { upload_stream: jest.fn(), destroy: jest.fn() };
const sdk = { config: jest.fn(), uploader } as unknown as CloudinarySdk;

function makeStorage(inUse: { project?: string[]; property?: string[] } = {}) {
  const prisma = {
    projectMedia: { findMany: jest.fn().mockResolvedValue((inUse.project ?? []).map((publicId) => ({ publicId }))) },
    propertyMedia: { findMany: jest.fn().mockResolvedValue((inUse.property ?? []).map((publicId) => ({ publicId }))) },
  };
  const config = { get: jest.fn().mockReturnValue({ cloudName: "demo", apiKey: "key", apiSecret: "secret" }) } as unknown as ConfigService;
  return { storage: new CloudinaryImageStorage(config, prisma as unknown as PrismaService, sdk), prisma };
}

beforeEach(() => {
  jest.clearAllMocks();
  uploader.destroy.mockResolvedValue({ result: "ok" });
});

describe("CloudinaryImageStorage.save", () => {
  it("sube la imagen a la carpeta indicada y devuelve su URL segura y su identificador", async () => {
    uploader.upload_stream.mockImplementation((_options, callback) => ({
      end: () => callback(null, { secure_url: "https://res.cloudinary.com/demo/image/upload/inti/projects/abc.png", public_id: "inti/projects/abc" }),
    }));
    const { storage } = makeStorage();

    await expect(storage.save(PNG, IMAGE_FOLDERS.projects)).resolves.toEqual({
      url: "https://res.cloudinary.com/demo/image/upload/inti/projects/abc.png",
      publicId: "inti/projects/abc",
    });
    expect(uploader.upload_stream.mock.calls[0][0]).toMatchObject({ folder: "inti/projects", resource_type: "image" });
  });

  it("no sube nada si el contenido no es una imagen real", async () => {
    const { storage } = makeStorage();
    await expect(storage.save(Buffer.from("MZ no soy una imagen"), IMAGE_FOLDERS.projects)).resolves.toBeNull();
    expect(uploader.upload_stream).not.toHaveBeenCalled();
  });

  it("falla con un mensaje claro, sin exponer el detalle, cuando Cloudinary rechaza la subida", async () => {
    uploader.upload_stream.mockImplementation((_options, callback) => ({ end: () => callback(new Error("Invalid api_key abc123"), undefined) }));
    const { storage } = makeStorage();
    await expect(storage.save(PNG, IMAGE_FOLDERS.properties)).rejects.toThrow("No se pudo guardar la imagen en el servicio de almacenamiento.");
  });
});

describe("CloudinaryImageStorage.remove", () => {
  it("elimina las imágenes que ya no usa ningún registro", async () => {
    const { storage } = makeStorage();
    await storage.remove(["inti/projects/a", "inti/properties/b"]);
    expect(uploader.destroy).toHaveBeenCalledTimes(2);
    expect(uploader.destroy).toHaveBeenCalledWith("inti/projects/a", { resource_type: "image", invalidate: true });
  });

  it("conserva las imágenes que otro proyecto o propiedad sigue usando", async () => {
    const { storage } = makeStorage({ project: ["inti/projects/a"], property: ["inti/properties/b"] });
    await storage.remove(["inti/projects/a", "inti/properties/b", "inti/projects/c"]);
    expect(uploader.destroy).toHaveBeenCalledTimes(1);
    expect(uploader.destroy).toHaveBeenCalledWith("inti/projects/c", expect.anything());
  });

  it("ignora identificadores fuera de la carpeta de Inti y los repetidos", async () => {
    const { storage, prisma } = makeStorage();
    await storage.remove(["otra-carpeta/x", "../inti/y", "inti/projects/a", "inti/projects/a"]);
    expect(uploader.destroy).toHaveBeenCalledTimes(1);
    expect(prisma.projectMedia.findMany).toHaveBeenCalledWith({ where: { publicId: { in: ["inti/projects/a"] } }, select: { publicId: true } });
  });

  it("no consulta ni llama a Cloudinary cuando no hay nada que borrar", async () => {
    const { storage, prisma } = makeStorage();
    await storage.remove([]);
    expect(prisma.projectMedia.findMany).not.toHaveBeenCalled();
    expect(uploader.destroy).not.toHaveBeenCalled();
  });

  it("no falla si Cloudinary no puede borrar un archivo", async () => {
    uploader.destroy.mockRejectedValue(new Error("timeout"));
    const { storage } = makeStorage();
    await expect(storage.remove(["inti/projects/a"])).resolves.toBeUndefined();
  });
});
