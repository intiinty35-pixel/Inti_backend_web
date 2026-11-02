import { Inject, Injectable } from "@nestjs/common";
import {
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  PROJECT_REPOSITORY,
  type ProjectFilters,
  type ProjectPage,
  type ProjectRepository,
} from "../domain/project";

@Injectable()
export class ListProjectsUseCase {
  constructor(@Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository) {}

  execute(filters: ProjectFilters, includeUnpublished = false, ownerId?: string): Promise<ProjectPage> {
    const pageSize = Math.min(Math.max(filters.pageSize ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
    const page = Math.max(filters.page ?? 1, 1);
    const normalizedFilters = { ...filters, page, pageSize };
    return ownerId
      ? this.projects.findMany(normalizedFilters, includeUnpublished, ownerId)
      : this.projects.findMany(normalizedFilters, includeUnpublished);
  }
}
