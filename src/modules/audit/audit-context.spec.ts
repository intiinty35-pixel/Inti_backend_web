import { auditAttributes, auditCategory, auditContext, deviceLabel, sanitizeAudit } from "./audit-context";
import { classifyRequest } from "./audit.service";

it("redacts credentials recursively without removing useful business fields", () => {
  const result = sanitizeAudit({ password: "secret-password", accessToken: "signed-token", nested: { api_key: "private-key", price: "10.00", title: "Property" }, file: Buffer.from("private") });
  expect(JSON.stringify(result)).not.toContain("secret-password");
  expect(JSON.stringify(result)).not.toContain("signed-token");
  expect(JSON.stringify(result)).not.toContain("private-key");
  expect(result).toEqual(expect.objectContaining({ nested: { api_key: "[REDACTADO]", price: "10.00", title: "Property" }, file: "[ARCHIVO OMITIDO]" }));
});

it("uses the server-resolved IP instead of trusting a forwarded header directly", () => {
  const actor = { id: "actor", name: "Agent", email: "agent@example.invalid", role: "AGENT" };
  const attributes = auditContext.run({ requestId: "generated", request: { auth: actor, method: "DELETE", path: "/api/properties/id", params: { id: "id" }, ip: "127.0.0.1", headers: { "x-forwarded-for": "203.0.113.88", "user-agent": "Mozilla/5.0 (Windows NT 10.0) Chrome/120.0" } } }, () => auditAttributes("actor"));
  expect(attributes).toEqual(expect.objectContaining({ actorName: "Agent", actorRole: "AGENT", ipAddress: "127.0.0.1", device: "Escritorio · Chrome · Windows", requestId: "generated" }));
});

it("distinguishes mobile devices and does not invent a device when no user agent exists", () => {
  expect(deviceLabel("Mozilla/5.0 (Linux; Android 14; Mobile) Chrome/120.0")).toBe("Móvil · Chrome · Android");
  expect(deviceLabel("")).toBeNull();
});

it("classifies business events and request operations consistently", () => {
  expect(auditCategory("PAYMENT_APPROVED")).toBe("PAYMENT");
  expect(auditCategory("PAYMENT_METHOD_UPDATED")).toBe("PAYMENT_METHOD");
  expect(auditCategory("PROJECT_DELETED")).toBe("PROJECT");
  expect(classifyRequest({ method: "DELETE", originalUrl: "/api/properties/id", headers: {}, params: {} })).toEqual(expect.objectContaining({ tracked: true, category: "PROPERTY", action: "PROPERTY_DELETED" }));
  expect(classifyRequest({ method: "GET", originalUrl: "/api/health", headers: {}, params: {} }).tracked).toBe(false);
  expect(classifyRequest({ method: "GET", originalUrl: "/api/audit/options", headers: {}, params: {} }).tracked).toBe(false);
  expect(classifyRequest({ method: "GET", originalUrl: "/api/billing/admin/receipts/id", headers: {}, params: {} }).tracked).toBe(true);
});
