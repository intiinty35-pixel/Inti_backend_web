import { Inject, Injectable } from "@nestjs/common";
import { PROJECT_REPOSITORY, isLotProjectType, type ProjectRepository, type ProjectUnit, type ProjectUnitData } from "../domain/project";
import { ProjectConflictError, ProjectNotFoundError } from "../domain/project.errors";
import { ensureUniqueUnit, validateUnit } from "./project-rules";

@Injectable()
export class ManageProjectUnitsUseCase {
  constructor(@Inject(PROJECT_REPOSITORY) private readonly projects: ProjectRepository) {}

  async add(projectId: string, unit: ProjectUnitData, ownerId?: string): Promise<ProjectUnit> {
    const project = await this.projects.findById(projectId, ownerId);
    if (!project) throw ProjectNotFoundError.project();
    const lotProject = isLotProjectType(project.type);
    const normalized = validateUnit(unit, lotProject);
    ensureUniqueUnit(normalized, project.units, lotProject);
    const created = await this.projects.addUnit(projectId, normalized, ownerId);
    if (!created) throw ProjectNotFoundError.project();
    return created;
  }

  async update(unitId: string, changes: Partial<ProjectUnitData>, ownerId?: string): Promise<ProjectUnit> {
    const found = await this.projects.findUnitWithProject(unitId, ownerId);
    if (!found) throw ProjectNotFoundError.unit();
    const lotProject = isLotProjectType(found.project.type);
    const normalized = validateUnit({ ...found.unit, ...changes }, lotProject);
    ensureUniqueUnit(normalized, found.project.units, lotProject, unitId);
    const updated = await this.projects.updateUnit(unitId, normalized, ownerId);
    if (!updated) throw ProjectNotFoundError.unit();
    return updated;
  }

  async remove(unitId: string, ownerId?: string): Promise<void> {
    const found = await this.projects.findUnitWithProject(unitId, ownerId);
    if (!found) throw ProjectNotFoundError.unit();
    if (found.unit.status === "SOLD") {
      throw new ProjectConflictError("No se puede eliminar una unidad vendida.");
    }
    if (!(await this.projects.deleteUnit(unitId, ownerId))) throw ProjectNotFoundError.unit();
  }
}
