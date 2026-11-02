import { JwtService, type JwtSignOptions } from "@nestjs/jwt";
import { createHmac } from "node:crypto";
import { AuthTokenService, TOKEN_ALGORITHM } from "./auth-token.service";

const SECRET = "a".repeat(40);
const service = (expiresIn: JwtSignOptions["expiresIn"] = "12h", secret = SECRET) =>
  new AuthTokenService(new JwtService({ secret, signOptions: { algorithm: TOKEN_ALGORITHM, expiresIn } }));

const base64url = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

describe("AuthTokenService", () => {
  it("firma un token que se puede verificar y reconoce al administrador", async () => {
    const tokens = service();
    const { token, expiresAt } = await tokens.sign("admin@inti.local", "ADMINISTRATOR");
    await expect(tokens.verify(token)).resolves.toMatchObject({ sub: "admin@inti.local", role: "ADMINISTRATOR" });
    await expect(tokens.isAdministrator(token)).resolves.toBe(true);
    expect(expiresAt).toBeGreaterThan(Date.now() + 11 * 60 * 60 * 1000);
  });

  it("no considera administrador a otros roles", async () => {
    const tokens = service();
    const { token } = await tokens.sign("ana", "USER");
    await expect(tokens.isAdministrator(token)).resolves.toBe(false);
  });

  it("rechaza tokens ausentes, mal formados o alterados", async () => {
    const tokens = service();
    const { token } = await tokens.sign("admin", "ADMINISTRATOR");
    await expect(tokens.verify(undefined)).resolves.toBeNull();
    await expect(tokens.verify("basura")).resolves.toBeNull();
    await expect(tokens.verify(`${token.slice(0, -3)}abc`)).resolves.toBeNull();
  });

  it("rechaza un token firmado con otra clave", async () => {
    const { token } = await service("12h", "b".repeat(40)).sign("admin", "ADMINISTRATOR");
    await expect(service().isAdministrator(token)).resolves.toBe(false);
  });

  it("rechaza un token vencido", async () => {
    const { token } = await service(-10).sign("admin", "ADMINISTRATOR");
    await expect(service().isAdministrator(token)).resolves.toBe(false);
  });

  it("rechaza un token sin firma (alg none)", async () => {
    const forged = `${base64url({ alg: "none", typ: "JWT" })}.${base64url({ sub: "x", role: "ADMINISTRATOR", exp: 9999999999 })}.`;
    await expect(service().isAdministrator(forged)).resolves.toBe(false);
  });

  it("rechaza un token firmado con otro algoritmo (HS384)", async () => {
    const header = base64url({ alg: "HS384", typ: "JWT" });
    const payload = base64url({ sub: "x", role: "ADMINISTRATOR", exp: 9999999999 });
    const signature = createHmac("sha384", SECRET).update(`${header}.${payload}`).digest("base64url");
    await expect(service().isAdministrator(`${header}.${payload}.${signature}`)).resolves.toBe(false);
  });
});
