import type { Property } from "./property";

export function compareProperties(a: Pick<Property, "averageRating" | "reviewsCount" | "commentsCount" | "createdAt">, b: Pick<Property, "averageRating" | "reviewsCount" | "commentsCount" | "createdAt">) {
  return (b.averageRating ?? 0) - (a.averageRating ?? 0) ||
    (b.commentsCount ?? 0) - (a.commentsCount ?? 0) ||
    (b.reviewsCount ?? 0) - (a.reviewsCount ?? 0) ||
    Date.parse(b.createdAt) - Date.parse(a.createdAt);
}
