import { Inject, Injectable } from "@nestjs/common";
import { PROJECT_REPOSITORY, isLotProjectType, type ProjectRepository, type ProjectUnit, type ProjectUnitData } from "../domain/project";
import { ProjectNotFoundError } from "../domain/project.errors";
import { validateUnit } from "./project-rules";

@Injectable()
export class ManageProjectUnitsUseCase {
  constructor(@Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository) {}

  async add(projectId: string, unit: ProjectUnitData, ownerId?: string): Promise<ProjectUnit> {
    const project = await this.projects.findById(projectId, ownerId);
    if (!project) throw ProjectNotFoundError.project();
    const created = await this.projects.addUnit(projectId, validateUnit(unit, isLotProjectType(project.type)), ownerId);
    if (!created) throw ProjectNotFoundError.project();
    return created;
  }

  async update(unitId: string, changes: Partial<ProjectUnitData>, ownerId?: string): Promise<ProjectUnit> {
    const updated = await this.projects.updateUnit(unitId, changes, ownerId);
    if (!updated) throw ProjectNotFoundError.unit();
    return updated;
  }

  async remove(unitId: string, ownerId?: string): Promise<void> {
    if (!(await this.projects.deleteUnit(unitId, ownerId))) throw ProjectNotFoundError.unit();
  }
}
