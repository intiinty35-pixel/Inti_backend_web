/** Tipos de aviso que genera la plataforma. El frontend los usa para elegir el ícono. */
export const NOTIFICATION_TYPES = [
  "FAVORITE_ADDED",
  "INQUIRY_RECEIVED",
  "PROPERTY_REVIEW",
  "PROJECT_COMMENT",
  "SYSTEM",
] as const;

export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Días que se conserva un aviso antes de dejar de mostrarse. */
export const NOTIFICATION_TTL_DAYS = 60;

export interface NotifyInput {
  /** Quién recibe el aviso. Si no hay destinatario (publicación sin dueño) no se hace nada. */
  userId: string | null | undefined;
  /** Quién provocó el aviso: nunca se le notifica a sí mismo. */
  actorId?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  actionUrl?: string;
  entityType?: "PROPERTY" | "PROJECT" | "INQUIRY";
  entityId?: string;
  /** Si es mayor que 0, no repite un aviso igual (mismo tipo y entidad) dentro de esas horas. */
  dedupeHours?: number;
}
