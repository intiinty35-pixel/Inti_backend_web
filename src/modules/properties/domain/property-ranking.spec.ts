import { compareProperties } from "./property-ranking";

it("prioritizes rating, then review count, then newest properties", () => {
  const items = [
    { id: "new", createdAt: "2026-11-07" },
    { id: "popular", averageRating: 4, reviewsCount: 20, createdAt: "2026-10-01" },
    { id: "best", averageRating: 5, reviewsCount: 1, createdAt: "2026-09-01" },
    { id: "old", createdAt: "2026-09-01" },
    { id: "rated", averageRating: 4, reviewsCount: 2, createdAt: "2026-11-07" },
  ];
  expect(items.sort(compareProperties).map((item) => item.id)).toEqual(["best", "popular", "rated", "new", "old"]);
});

it("uses comment activity to order equally rated properties", () => {
  const items = [
    { id: "stars-only", averageRating: 4, commentsCount: 0, reviewsCount: 20, createdAt: "2026-11-07" },
    { id: "commented", averageRating: 4, commentsCount: 3, reviewsCount: 3, createdAt: "2026-10-01" },
  ];
  expect(items.sort(compareProperties).map((item) => item.id)).toEqual(["commented", "stars-only"]);
});
