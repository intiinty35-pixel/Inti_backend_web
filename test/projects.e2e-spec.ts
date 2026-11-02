import { ValidationPipe, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { execSync } from "node:child_process";
import { mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaService } from "../src/infrastructure/persistence/prisma.service";

const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const ADMIN = { email: "admin@inti.local", password: "contrasena-de-prueba" };
const description = "Proyecto de prueba con una descripción suficientemente larga para pasar la validación.";

let app: INestApplication;
let baseUrl: string;
let workDir: string;
let token: string;
let memberToken: string;

interface Reply<T = any> {
  status: number;
  body: T;
}

async function call<T = any>(method: string, path: string, options: { token?: string | null; body?: unknown; form?: FormData } = {}): Promise<Reply<T>> {
  const authToken = options.token === undefined ? token : options.token;
  const response = await fetch(`${baseUrl}/api${path}`, {
    method,
    headers: {
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...(options.body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: options.form ?? (options.body !== undefined ? JSON.stringify(options.body) : undefined),
  });
  const text = await response.text();
  return { status: response.status, body: text ? (JSON.parse(text) as T) : (undefined as T) };
}

async function uploadImages(count: number, authToken: string | null = memberToken): Promise<Array<{ url: string; publicId: string }>> {
  const form = new FormData();
  for (let index = 0; index < count; index++) form.append("files", new Blob([PNG], { type: "image/png" }), `imagen-${index}.png`);
  const reply = await call("POST", "/projects/media", { form, token: authToken });
  expect(reply.status).toBe(201);
  return reply.body.media;
}

const residentialBody = (media: Array<{ url: string; publicId: string }>, overrides: Record<string, unknown> = {}) => ({
  name: "Torres del Urubó",
  description,
  type: "RESIDENTIAL",
  phase: "PRE_SALE",
  currency: "USD",
  department: "Santa Cruz",
  province: "Andrés Ibáñez",
  district: "Urubó",
  address: "Av. Principal 100",
  latitude: -17.76,
  longitude: -63.23,
  units: [
    { unitNumber: "101", type: "APARTMENT", floor: 1, area: 80, price: 100000, status: "AVAILABLE" },
    { unitNumber: "102", type: "APARTMENT", floor: 1, area: 95, price: 130000, status: "SOLD" },
  ],
  media: media.map((item) => ({ ...item, kind: "IMAGE" })),
  amenities: ["Piscina", "Gimnasio", "Piscina"],
  timeline: [{ phase: "Inicio de obra", date: "2026-03-01", description: "Excavación" }],
  ...overrides,
});

const lotizationBody = (media: Array<{ url: string; publicId: string }>, overrides: Record<string, unknown> = {}) => ({
  name: "Lotización Las Palmas",
  description,
  type: "LOTIZATION",
  phase: "PLOTTING",
  currency: "BOB",
  department: "Santa Cruz",
  province: "Warnes",
  district: "Warnes",
  address: "Carretera al Norte km 20",
  ruc: "1234567890",
  socialReason: "Inmobiliaria Las Palmas S.R.L.",
  initialFee: 5000,
  monthlyPayment: 900,
  totalBlocks: 2,
  units: [
    { unitNumber: "", type: "LOT", block: "A", lotNumber: "1", area: 300, frontWidth: 10, price: 60000, status: "AVAILABLE" },
    { unitNumber: "", type: "LOT", block: "B", lotNumber: "1", area: 320, frontWidth: 12, price: 70000, status: "AVAILABLE" },
  ],
  media: media.map((item) => ({ ...item, kind: "IMAGE" })),
  amenities: [],
  timeline: [],
  ...overrides,
});

async function createProject(body: object, authToken: string = memberToken): Promise<any> {
  const reply = await call("POST", "/projects", { body, token: authToken });
  expect(reply.body).toMatchObject({ id: expect.any(String) });
  expect(reply.status).toBe(201);
  return reply.body;
}

beforeAll(async () => {
  const projectRoot = process.cwd();
  workDir = mkdtempSync(join(tmpdir(), "inti-e2e-"));
  Object.assign(process.env, {
    DATABASE_URL: `file:${join(workDir, "test.db").replace(/\\/g, "/")}`,
    ADMIN_EMAIL: ADMIN.email,
    ADMIN_PASSWORD: ADMIN.password,
    AUTH_SECRET: "e".repeat(40),
    API_PUBLIC_URL: "http://localhost",
  });
  execSync("pnpm exec prisma migrate deploy", { cwd: projectRoot, env: process.env, stdio: "pipe" });

  // Las imágenes se guardan en <cwd>/uploads: se apunta a la carpeta temporal para no tocar las reales.
  process.chdir(workDir);
  const { AppModule } = await import("../src/app.module");
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  app = moduleRef.createNestApplication();
  app.setGlobalPrefix("api");
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true, forbidNonWhitelisted: true }));
  await app.listen(0, "127.0.0.1");
  baseUrl = await app.getUrl();

  const login = await call("POST", "/auth/login", { body: ADMIN, token: null });
  token = login.body.token;

  const member = await call("POST", "/users", {
    body: { name: "Miembro E2E", email: "miembro-e2e@inti.local", password: "prueba-segura-123", role: "USER" },
    token,
  });
  expect(member.status).toBe(201);
  const memberLogin = await call("POST", "/auth/login", {
    body: { email: "miembro-e2e@inti.local", password: "prueba-segura-123" },
    token: null,
  });
  expect(memberLogin.status).toBe(201);
  memberToken = memberLogin.body.token;
});

afterAll(async () => {
  await app?.close();
  process.chdir(tmpdir());
  rmSync(workDir, { recursive: true, force: true });
});

describe("autenticación", () => {
  it("el login correcto devuelve un token y el incorrecto es rechazado", async () => {
    expect(token).toEqual(expect.any(String));
    const prisma = app.get(PrismaService);
    await prisma.user.update({
      where: { email: ADMIN.email },
      data: { passwordHash: "hash-anterior" },
    });
    const configuredAdmin = await call("POST", "/auth/login", { body: ADMIN, token: null });
    expect(configuredAdmin.status).toBe(201);
    expect(configuredAdmin.body).toMatchObject({ role: "ADMINISTRATOR", email: ADMIN.email });

    const oldAdminPassword = await call("POST", "/auth/login", {
      body: { email: ADMIN.email, password: "hash-anterior" },
      token: null,
    });
    expect(oldAdminPassword.status).toBe(401);

    const wrong = await call("POST", "/auth/login", { body: { email: ADMIN.email, password: "incorrecta123" }, token: null });
    expect(wrong.status).toBe(401);
  });

  it("registra usuarios recurrentes y devuelve las series mensuales del dashboard", async () => {
    const createdUser = await call("POST", "/users", {
      body: { name: "Usuario recurrente", email: "recurrente-test@inti.local", password: "prueba-segura-123", role: "USER" },
    });
    expect(createdUser.status).toBe(201);

    for (let attempt = 0; attempt < 2; attempt++) {
      const login = await call("POST", "/auth/login", {
        body: { email: "recurrente-test@inti.local", password: "prueba-segura-123" },
        token: null,
      });
      expect(login.status).toBe(201);
    }

    const prisma = app.get(PrismaService);
    expect(await prisma.loginEvent.count({ where: { userId: createdUser.body.id } })).toBe(2);
    const dashboard = await call("GET", "/dashboard/metrics");
    const currentMonth = new Date().toISOString().slice(0, 7);
    expect(dashboard.status).toBe(200);
    expect(dashboard.body.newUsersByMonth).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: currentMonth, value: expect.any(Number) }),
    ]));
    expect(dashboard.body.recurringUsersByMonth).toEqual(expect.arrayContaining([
      expect.objectContaining({ label: currentMonth, value: expect.any(Number) }),
    ]));
    expect(dashboard.body.recurringUsersByMonth.find((month: { label: string }) => month.label === currentMonth).value).toBeGreaterThanOrEqual(1);
  });

  it("separa las cuentas, los proyectos y las propiedades por rol y propietario", async () => {
    const createdUser = await call("POST", "/users", {
      body: { name: "Agente de prueba", email: "agente-test@inti.local", password: "prueba-segura-123", role: "AGENT" },
    });
    expect(createdUser.status).toBe(201);
    const userLogin = await call("POST", "/auth/login", {
      body: { email: "agente-test@inti.local", password: "prueba-segura-123" },
      token: null,
    });
    expect(userLogin.status).toBe(201);
    const userToken = userLogin.body.token as string;
    expect(userLogin.body).toMatchObject({ role: "AGENT", email: "agente-test@inti.local" });
    expect((await call("GET", "/users", { token: userToken })).status).toBe(401);
    expect((await call("GET", "/dashboard/metrics", { token: userToken })).status).toBe(401);

    const ownProjectBody = residentialBody(await uploadImages(1, userToken));
    const ownProject = await call("POST", "/projects", { body: ownProjectBody, token: userToken });
    expect(ownProject.status).toBe(201);
    const otherProject = await createProject(residentialBody(await uploadImages(1)));
    const ownProjects = await call("GET", "/projects/mine", { token: userToken });
    expect(ownProjects.body.items.map((project: { id: string }) => project.id)).toEqual([ownProject.body.id]);
    expect((await call("GET", "/projects/admin/all", { token: userToken })).status).toBe(401);
    expect((await call("PUT", `/projects/${otherProject.id}`, { body: ownProjectBody, token: userToken })).status).toBe(404);
    expect((await call("DELETE", `/projects/${otherProject.id}?force=true`, { token: userToken })).status).toBe(404);

    const propertyInput = (title: string) => ({
      createdByRole: "USER",
      operationType: "SALE",
      propertyType: "APARTMENT",
      title,
      description: "Departamento amplio de prueba con una descripción suficientemente larga para validar correctamente la publicación en el portal de Inti.",
      price: 120000,
      currency: "BOB",
      location: { department: "Santa Cruz", province: "Andrés Ibáñez", district: "Centro", address: "Calle de prueba 10", approximateLocation: true },
      details: { bedrooms: 2, bathrooms: 1 },
      amenityCodes: [],
      media: [{ url: "https://example.test/property.png" }],
    });
    const ownProperty = await call("POST", "/properties", { body: propertyInput("Propiedad de agente"), token: userToken });
    expect(ownProperty.status).toBe(201);
    expect(ownProperty.body.ownerId).toBe(createdUser.body.id);
    const otherProperty = await call("POST", "/properties", { body: propertyInput("Propiedad de admin"), token: memberToken });
    expect(otherProperty.status).toBe(201);
    const ownProperties = await call("GET", "/properties/mine", { token: userToken });
    expect(ownProperties.body.map((property: { id: string }) => property.id)).toEqual([ownProperty.body.id]);
    expect((await call("GET", "/properties/admin/all")).body.map((property: { id: string }) => property.id)).toContain(otherProperty.body.id);
    expect((await call("DELETE", `/properties/${otherProperty.body.id}`, { token: userToken })).status).toBe(404);
    const publicProperty = (await call("GET", "/properties", { token: null })).body.find((property: { id: string }) => property.id === ownProperty.body.id);
    expect(publicProperty).not.toHaveProperty("ownerId");

    await call("DELETE", `/projects/${ownProject.body.id}?force=true`);
    await call("DELETE", `/projects/${otherProject.id}?force=true`);
    await call("DELETE", `/properties/${ownProperty.body.id}`);
    await call("DELETE", `/properties/${otherProperty.body.id}`);
  });

  it("limita los intentos de login desde la misma IP", async () => {
    const statuses: number[] = [];
    for (let attempt = 0; attempt < 10; attempt++) {
      statuses.push((await call("POST", "/auth/login", { body: { email: ADMIN.email, password: "incorrecta123" }, token: null })).status);
    }
    expect(statuses).toContain(429);
  });

  it.each([
    ["crear", () => call("POST", "/projects", { token: null, body: {} })],
    ["editar", () => call("PUT", "/projects/x", { token: null, body: {} })],
    ["borrar", () => call("DELETE", "/projects/x", { token: null })],
    ["cambiar el estado", () => call("PATCH", "/projects/x/status", { token: null, body: { status: "PUBLISHED" } })],
    ["subir imágenes", () => call("POST", "/projects/media", { token: null, form: new FormData() })],
    ["listar borradores", () => call("GET", "/projects/admin/all", { token: null })],
    ["borrar un comentario", () => call("DELETE", "/projects/comments/x", { token: null })],
  ])("no permite %s sin sesión de administrador", async (_action, request) => {
    expect((await request()).status).toBe(401);
  });

  it("rechaza un token alterado", async () => {
    expect((await call("GET", "/projects/admin/all", { token: `${token.slice(0, -3)}abc` })).status).toBe(401);
  });
});

describe("subida de imágenes", () => {
  it("rechaza un archivo que no es una imagen aunque declare serlo", async () => {
    const form = new FormData();
    form.append("files", new Blob([Buffer.from("MZ no soy una imagen")], { type: "image/png" }), "falso.png");
    expect((await call("POST", "/projects/media", { form })).status).toBe(400);
  });

  it("guarda las imágenes reales y las sirve con el tipo correcto", async () => {
    const [image] = await uploadImages(1);
    const served = await fetch(image.url.replace("http://localhost", baseUrl));
    expect(served.status).toBe(200);
    expect(served.headers.get("content-type")).toBe("image/png");
  });

  it("no sirve archivos fuera de la carpeta de subidas", async () => {
    expect((await fetch(`${baseUrl}/api/projects/media/..%2F..%2Ftest.db`)).status).toBe(404);
  });
});

describe("ciclo de vida de un proyecto", () => {
  it("lo crea como borrador, lo oculta al público y lo publica", async () => {
    const media = await uploadImages(1);
    const project = await createProject(residentialBody(media));
    expect(project).toMatchObject({ status: "DRAFT", currency: "USD", amenities: ["Piscina", "Gimnasio"] });
    expect(project.stats).toMatchObject({ totalUnits: 2, soldUnits: 1, availableUnits: 1, priceFrom: 100000, priceTo: 130000 });

    expect((await call("GET", `/projects/${project.slug}`, { token: null })).status).toBe(404);
    expect((await call("GET", `/projects/${project.slug}`)).status).toBe(200);
    expect((await call("GET", "/projects", { token: null })).body.items.map((item: any) => item.id)).not.toContain(project.id);

    const published = await call("PATCH", `/projects/${project.id}/status`, { body: { status: "PUBLISHED" } });
    expect(published.body.status).toBe("PUBLISHED");
    const visible = await call("GET", `/projects/${project.slug}`, { token: null });
    expect(visible.status).toBe(200);
    expect(visible.body.viewsCount).toBe(1);

    await call("DELETE", `/projects/${project.id}?force=true`);
  });

  it("edita el proyecto conservando las unidades existentes y borrando del disco las imágenes quitadas", async () => {
    const [first, second] = await uploadImages(2);
    const project = await createProject(residentialBody([first, second]));
    const uploadDir = join(process.cwd(), "uploads", "projects");
    expect(readdirSync(uploadDir)).toEqual(expect.arrayContaining([first.publicId, second.publicId]));

    const sold = project.units.find((unit: any) => unit.unitNumber === "102");
    const edited = await call("PUT", `/projects/${project.id}`, {
      body: residentialBody([first], {
        name: "Torres del Urubó II",
        amenities: ["Piscina"],
        units: [{ unitNumber: "103", type: "PENTHOUSE", status: "RESERVED", price: 250000 }, sold],
      }),
    });
    expect(edited.status).toBe(200);
    expect(edited.body).toMatchObject({ name: "Torres del Urubó II", amenities: ["Piscina"] });
    expect(edited.body.units).toHaveLength(2);
    expect(edited.body.units.map((unit: any) => unit.id)).toContain(sold.id);
    expect(existsSync(join(uploadDir, second.publicId))).toBe(false);
    expect(existsSync(join(uploadDir, first.publicId))).toBe(true);

    expect((await call("PUT", "/projects/inexistente", { body: residentialBody([first]) })).status).toBe(404);
    await call("DELETE", `/projects/${project.id}?force=true`);
  });

  it("exige confirmación para borrar un proyecto con unidades vendidas y limpia sus archivos", async () => {
    const [image] = await uploadImages(1);
    const project = await createProject(residentialBody([image]));

    const refused = await call("DELETE", `/projects/${project.id}`);
    expect(refused.status).toBe(409);
    expect(refused.body).toMatchObject({ statusCode: 409, error: "Conflict", message: expect.stringContaining("vendida") });

    expect((await call("DELETE", `/projects/${project.id}?force=true`)).status).toBe(204);
    expect((await call("GET", `/projects/${project.slug}`)).status).toBe(404);
    expect(existsSync(join(process.cwd(), "uploads", "projects", image.publicId))).toBe(false);
  });

  it("borra sin confirmación cuando no hay unidades vendidas", async () => {
    const [image] = await uploadImages(1);
    const available = residentialBody([image], { units: [{ unitNumber: "1", type: "APARTMENT", status: "AVAILABLE" }] });
    const project = await createProject(available);
    expect((await call("DELETE", `/projects/${project.id}`)).status).toBe(204);
  });
});

describe("validaciones de negocio", () => {
  let media: Array<{ url: string; publicId: string }>;
  beforeAll(async () => {
    media = await uploadImages(1);
  });

  const invalid = async (body: object, message: RegExp) => {
    const reply = await call("POST", "/projects", { body, token: memberToken });
    expect(reply.status).toBe(400);
    expect(JSON.stringify(reply.body.message)).toMatch(message);
  };

  it("responde 400, no 500, ante datos inválidos", async () => {
    await invalid(residentialBody([]), /al menos una imagen/);
    await invalid(residentialBody(media, { units: [] }), /al menos una unidad/);
    await invalid(residentialBody(media, { phase: "URBANIZATION" }), /fase elegida/);
    await invalid(residentialBody(media, { startDate: "012027-03-12" }), /fecha válida/);
    await invalid(residentialBody(media, { timeline: [{ phase: "X", date: "2027-02-31" }] }), /fecha válida/);
    await invalid(residentialBody(media, { units: [{ unitNumber: "1", type: "LOT", block: "A", lotNumber: "1", status: "AVAILABLE" }] }), /lotización/);
    await invalid(residentialBody(media, { name: "" }), /name/);
    await invalid(residentialBody(media, { campoInventado: true }), /campoInventado/);
  });

  it("aplica las reglas de la lotización", async () => {
    await invalid(lotizationBody(media, { ruc: undefined }), /RUC/);
    await invalid(lotizationBody(media, { totalBlocks: 1 }), /total de manzanas/);
    await invalid(
      lotizationBody(media, {
        units: [
          { unitNumber: "", type: "LOT", block: "A", lotNumber: "1", status: "AVAILABLE" },
          { unitNumber: "", type: "LOT", block: "a", lotNumber: "1", status: "AVAILABLE" },
        ],
      }),
      /repetidos/,
    );
  });

  it("crea una lotización con lotes por manzana y sus datos de financiamiento", async () => {
    const project = await createProject(lotizationBody(media));
    expect(project).toMatchObject({ ruc: "1234567890", initialFee: 5000, totalBlocks: 2 });
    expect(project.units.map((unit: any) => unit.unitNumber)).toEqual(["A-1", "B-1"]);
    await call("DELETE", `/projects/${project.id}`);
  });
});

describe("unidades", () => {
  it("agrega, marca como vendida y borra una unidad", async () => {
    const media = await uploadImages(1);
    const project = await createProject(residentialBody(media, { units: [{ unitNumber: "1", type: "APARTMENT", status: "AVAILABLE" }] }));

    const added = await call("POST", `/projects/${project.id}/units`, { body: { unitNumber: "2", type: "OFFICE", status: "AVAILABLE", price: 90000 } });
    expect(added.status).toBe(201);
    const sold = await call("PATCH", `/projects/units/${added.body.id}`, { body: { status: "SOLD" } });
    expect(sold.body.status).toBe("SOLD");
    expect((await call("DELETE", `/projects/units/${added.body.id}`)).status).toBe(409);
    const reopened = await call("PATCH", `/projects/units/${added.body.id}`, { body: { status: "AVAILABLE" } });
    expect(reopened.status).toBe(200);
    expect((await call("DELETE", `/projects/units/${added.body.id}`)).status).toBe(204);
    expect((await call("DELETE", `/projects/units/${added.body.id}`)).status).toBe(404);
    await call("DELETE", `/projects/${project.id}`);
  });
});

describe("comentarios", () => {
  it("se escriben sin cuenta, solo en proyectos publicados, y el administrador puede borrarlos", async () => {
    const media = await uploadImages(1);
    const project = await createProject(residentialBody(media));
    const body = { authorName: "Ana", content: "¡Muy buen proyecto!" };

    expect((await call("POST", `/projects/${project.id}/comments`, { token: null, body })).status).toBe(404);
    await call("PATCH", `/projects/${project.id}/status`, { body: { status: "PUBLISHED" } });

    const created = await call("POST", `/projects/${project.id}/comments`, { token: null, body });
    expect(created.status).toBe(201);
    expect((await call("GET", `/projects/${project.id}/comments`, { token: null })).body).toHaveLength(1);
    expect((await call("POST", `/projects/${project.id}/comments`, { token: null, body: { authorName: "A", content: "x" } })).status).toBe(400);

    expect((await call("DELETE", `/projects/comments/${created.body.id}`, { token: null })).status).toBe(401);
    expect((await call("DELETE", `/projects/comments/${created.body.id}`)).status).toBe(204);
    await call("DELETE", `/projects/${project.id}?force=true`);
  });

  it("limita la cantidad de comentarios por minuto", async () => {
    const media = await uploadImages(1);
    const project = await createProject(residentialBody(media, { units: [{ unitNumber: "1", type: "APARTMENT", status: "AVAILABLE" }] }));
    await call("PATCH", `/projects/${project.id}/status`, { body: { status: "PUBLISHED" } });

    const statuses: number[] = [];
    for (let index = 0; index < 8; index++) {
      statuses.push((await call("POST", `/projects/${project.id}/comments`, { token: null, body: { authorName: "Spam", content: `mensaje repetido ${index}` } })).status);
    }
    expect(statuses).toContain(429);
    await call("DELETE", `/projects/${project.id}`);
  });
});

describe("listado, filtros y paginación", () => {
  const created: string[] = [];

  beforeAll(async () => {
    const media = await uploadImages(1);
    const specs = [
      { name: "Proyecto Barato", district: "Equipetrol", price: 50000, currency: "USD" },
      { name: "Proyecto Medio", district: "Urubó", price: 150000, currency: "USD" },
      { name: "Proyecto Caro", district: "Urubó", price: 500000, currency: "BOB" },
    ];
    for (const spec of specs) {
      const project = await createProject(
        residentialBody(media, { name: spec.name, district: spec.district, currency: spec.currency, units: [{ unitNumber: "1", type: "APARTMENT", status: "AVAILABLE", price: spec.price }] }),
      );
      await call("PATCH", `/projects/${project.id}/status`, { body: { status: "PUBLISHED" } });
      created.push(project.id);
    }
  });

  afterAll(async () => {
    for (const id of created) await call("DELETE", `/projects/${id}`);
  });

  const names = async (query: string) => (await call("GET", `/projects?${query}`, { token: null })).body.items.map((item: any) => item.name).sort();

  it("filtra por ubicación, moneda y rango de precio", async () => {
    expect(await names("location=urub")).toEqual(["Proyecto Caro", "Proyecto Medio"]);
    expect(await names("currency=USD")).toEqual(["Proyecto Barato", "Proyecto Medio"]);
    expect(await names("priceMin=100000&currency=USD")).toEqual(["Proyecto Medio"]);
    expect(await names("priceMax=100000&currency=USD")).toEqual(["Proyecto Barato"]);
    expect(await names("search=caro")).toEqual(["Proyecto Caro"]);
  });

  it("pagina los resultados e informa el total", async () => {
    const firstPage = await call("GET", "/projects?pageSize=2&page=1", { token: null });
    expect(firstPage.body).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(firstPage.body.items).toHaveLength(2);
    const secondPage = await call("GET", "/projects?pageSize=2&page=2", { token: null });
    expect(secondPage.body.items).toHaveLength(1);
  });

  it("rechaza un tamaño de página mayor al máximo", async () => {
    expect((await call("GET", "/projects?pageSize=500", { token: null })).status).toBe(400);
  });

  it("el administrador ve también los borradores en su listado", async () => {
    const draft = await createProject(residentialBody(await uploadImages(1), { name: "Proyecto Borrador" }));
    const all = await call("GET", "/projects/admin/all", { token });
    expect(all.body.items.map((item: any) => item.name)).toContain("Proyecto Borrador");
    expect(await names("search=borrador")).toEqual([]);
    await call("DELETE", `/projects/${draft.id}?force=true`);
  });
});
