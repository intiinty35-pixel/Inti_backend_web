import { AsyncLocalStorage } from "node:async_hooks";

export interface AuditActor { id: string; name: string; email: string; role: string }
export interface AuditRequest {
  auth?: AuditActor;
  method: string;
  originalUrl?: string;
  path?: string;
  ip?: string;
  socket?: { remoteAddress?: string };
  headers: Record<string, string | string[] | undefined>;
  params: Record<string, string>;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
}
export interface AuditContext {
  request: AuditRequest;
  requestId: string;
  actor?: AuditActor;
  intercepted?: boolean;
  resourceId?: string;
  resourceName?: string;
  subjectId?: string;
  subjectName?: string;
  before?: unknown;
}
export const auditContext = new AsyncLocalStorage<AuditContext>();

export function auditCategory(action: string) {
  if (/^(PROJECT|PROJECT_UNIT|PROJECT_COMMENT)_/.test(action)) return "PROJECT";
  if (/^(PROPERTY|PUBLICATION)_/.test(action)) return "PROPERTY";
  if (/^(SUBSCRIPTION|FREE_PLAN)_/.test(action)) return "SUBSCRIPTION";
  if (/^PAYMENT_(METHOD|QR)_/.test(action)) return "PAYMENT_METHOD";
  if (/^(ORDER|PAYMENT|RECEIPT)_/.test(action)) return "PAYMENT";
  if (/^PLAN_/.test(action)) return "PLAN";
  if (/^(ACCOUNT|ADMIN_ACCOUNT|USER)_/.test(action)) return "USER";
  if (/^AUTH_/.test(action)) return "AUTH";
  if (/^INQUIRY_/.test(action)) return "INQUIRY";
  if (/^SETTINGS_/.test(action)) return "CONFIG";
  return "SYSTEM";
}

export function deviceLabel(agent: string) {
  if (!agent) return null;
  const browser = /Edg\//.test(agent) ? "Edge" : /Firefox\//.test(agent) ? "Firefox" : /Chrome\//.test(agent) ? "Chrome" : /Safari\//.test(agent) ? "Safari" : "Cliente API";
  const os = /iPhone|iPad/.test(agent) ? "iOS" : /Android/.test(agent) ? "Android" : /Windows/.test(agent) ? "Windows" : /Macintosh|Mac OS/.test(agent) ? "macOS" : /Linux/.test(agent) ? "Linux" : "";
  const kind = /iPad|Tablet/.test(agent) || (/Android/.test(agent) && !/Mobile/.test(agent)) ? "Tablet" : /Mobile|iPhone/.test(agent) ? "Móvil" : os ? "Escritorio" : "";
  return [kind, browser, os].filter(Boolean).join(" · ");
}

export function resourceLabel(value: unknown): string | undefined {
  if (!value || typeof value !== "object") return undefined;
  const row = value as Record<string, unknown>;
  for (const field of ["title", "name", "number", "planName", "originalName"]) if (typeof row[field] === "string") return (row[field] as string).slice(0, 200);
  return undefined;
}

export function auditAttributes(actorId: string): { actorName?: string; actorEmail?: string; actorRole?: string; device?: string | null; requestId?: string; ipAddress?: string; userAgent?: string; httpMethod?: string; path?: string } {
  const context = auditContext.getStore();
  const request = context?.request;
  const actor = request?.auth ?? context?.actor;
  const userAgent = typeof request?.headers["user-agent"] === "string" ? request.headers["user-agent"].slice(0, 1000) : undefined;
  return {
    ...(actorId === "SYSTEM" ? { actorName: "Sistema", actorRole: "SYSTEM", device: "Proceso automático" } : actor?.id === actorId ? { actorName: actor.name, actorEmail: actor.email, actorRole: actor.role } : {}),
    ...(request ? { requestId: context!.requestId, ipAddress: (request.ip ?? request.socket?.remoteAddress)?.slice(0, 80), userAgent, device: deviceLabel(userAgent ?? ""), httpMethod: request.method, path: (request.originalUrl ?? request.path ?? "").split("?")[0].slice(0, 500) } : {}),
  };
}

export function sanitizeAudit(value: unknown, depth = 0): unknown {
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, 8000);
  if (typeof value === "bigint") return value.toString();
  if (Buffer.isBuffer(value)) return "[ARCHIVO OMITIDO]";
  if (value instanceof Date) return value.toISOString();
  if (depth > 6) return "[CONTENIDO RESUMIDO]";
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeAudit(item, depth + 1));
  if (typeof value === "object") {
    if ("toJSON" in value && typeof value.toJSON === "function") return sanitizeAudit(value.toJSON(), depth + 1);
    return Object.fromEntries(Object.entries(value).slice(0, 60).map(([key, item]) => [key, /password|contrase|token|secret|authorization|cookie|api.?key|smtp|database.?url|cloudinary.?url/i.test(key) ? "[REDACTADO]" : sanitizeAudit(item, depth + 1)]));
  }
  return undefined;
}
