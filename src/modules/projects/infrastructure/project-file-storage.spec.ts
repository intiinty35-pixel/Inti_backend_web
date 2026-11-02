import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ProjectFileStorage as ProjectFileStorageType } from "./project-file-storage";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const WEBP = Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(4), Buffer.from("WEBP"), Buffer.alloc(16)]);

describe("ProjectFileStorage", () => {
  let workDir: string;
  let storage: ProjectFileStorageType;

  // La carpeta de subidas se calcula al cargar el módulo, así que se apunta a un directorio temporal antes.
  beforeAll(async () => {
    workDir = mkdtempSync(join(tmpdir(), "inti-storage-"));
    jest.spyOn(process, "cwd").mockReturnValue(workDir);
    const { ProjectFileStorage } = await import("./project-file-storage");
    storage = new ProjectFileStorage();
  });

  afterAll(() => {
    jest.restoreAllMocks();
    rmSync(workDir, { recursive: true, force: true });
  });

  it.each([
    ["PNG", PNG, ".png"],
    ["JPEG", JPEG, ".jpg"],
    ["WEBP", WEBP, ".webp"],
  ])("guarda una imagen %s real con su extensión correcta", async (_name, buffer, extension) => {
    const filename = await storage.saveImage(buffer);
    expect(filename).toMatch(new RegExp(`^[0-9a-f-]{36}\\${extension}$`));
    expect(storage.open(filename!)?.stream.destroy()).toBeDefined();
  });

  it("rechaza contenido que no es una imagen aunque se haga pasar por una", async () => {
    await expect(storage.saveImage(Buffer.from("MZ ejecutable disfrazado de imagen"))).resolves.toBeNull();
    await expect(storage.saveImage(Buffer.alloc(0))).resolves.toBeNull();
  });

  it("no abre archivos fuera de la carpeta de subidas", () => {
    expect(storage.open("../../etc/passwd")).toBeNull();
    expect(storage.open("..%2F..%2F.env")).toBeNull();
    expect(storage.open("inexistente.png")).toBeNull();
  });

  it("elimina los archivos indicados e ignora los que no existen o intentan salir de la carpeta", async () => {
    const filename = (await storage.saveImage(PNG))!;
    await storage.remove([filename, "no-existe.png", "../fuera.png"]);
    expect(storage.open(filename)).toBeNull();
    expect(existsSync(join(workDir, "fuera.png"))).toBe(false);
  });
});
