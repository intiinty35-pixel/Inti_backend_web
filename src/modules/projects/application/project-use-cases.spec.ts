import type { Project, ProjectRepository, ProjectStatus, ProjectUnit } from "../domain/project";
import { ProjectConflictError, ProjectNotFoundError, ProjectValidationError } from "../domain/project.errors";
import type { ImageStorage } from "../../../shared/image-storage";
import { DeleteProjectUseCase } from "./delete-project.use-case";
import { GetProjectUseCase } from "./get-project.use-case";
import { ListProjectsUseCase } from "./list-projects.use-case";
import { ManageProjectUnitsUseCase } from "./manage-project-units.use-case";
import { ProjectCommentsUseCase } from "./project-comments.use-case";
import { UpdateProjectUseCase } from "./update-project.use-case";

function fakeProject(overrides: Partial<Project> = {}): Project {
  return { id: "p1", slug: "proyecto-p1", status: "PUBLISHED", type: "RESIDENTIAL", viewsCount: 0, stats: { soldUnits: 0 }, ...overrides } as Project;
}

function fakeRepository(): jest.Mocked<ProjectRepository> {
  return {
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
    setStatus: jest.fn(),
    findById: jest.fn(),
    findBySlug: jest.fn(),
    findMany: jest.fn(),
    incrementViews: jest.fn(),
    addUnit: jest.fn(),
    updateUnit: jest.fn(),
    deleteUnit: jest.fn(),
    listComments: jest.fn(),
    addComment: jest.fn(),
    deleteComment: jest.fn(),
    findUnitWithProject: jest.fn(),
  };
}

const fakeFiles = () => ({ save: jest.fn(), remove: jest.fn().mockResolvedValue(undefined) }) as unknown as jest.Mocked<ImageStorage>;

describe("DeleteProjectUseCase", () => {
  it("falla si el proyecto no existe", async () => {
    const repository = fakeRepository();
    repository.findById.mockResolvedValue(null);
    await expect(new DeleteProjectUseCase(repository, fakeFiles()).execute("x", false)).rejects.toBeInstanceOf(ProjectNotFoundError);
  });

  it("exige confirmación cuando hay unidades vendidas", async () => {
    const repository = fakeRepository();
    repository.findById.mockResolvedValue(fakeProject({ stats: { soldUnits: 2 } as Project["stats"] }));
    await expect(new DeleteProjectUseCase(repository, fakeFiles()).execute("p1", false)).rejects.toBeInstanceOf(ProjectConflictError);
    expect(repository.delete).not.toHaveBeenCalled();
  });

  it("borra el proyecto con unidades vendidas si se confirma, y elimina sus archivos", async () => {
    const repository = fakeRepository();
    const files = fakeFiles();
    repository.findById.mockResolvedValue(fakeProject({ stats: { soldUnits: 2 } as Project["stats"] }));
    repository.delete.mockResolvedValue({ publicIds: ["a.png", "b.png"] });
    await new DeleteProjectUseCase(repository, files).execute("p1", true);
    expect(repository.delete).toHaveBeenCalledWith("p1");
    expect(files.remove).toHaveBeenCalledWith(["a.png", "b.png"]);
  });

  it("borra sin confirmación cuando no hay ventas", async () => {
    const repository = fakeRepository();
    repository.findById.mockResolvedValue(fakeProject());
    repository.delete.mockResolvedValue({ publicIds: [] });
    await expect(new DeleteProjectUseCase(repository, fakeFiles()).execute("p1", false)).resolves.toBeUndefined();
  });
});

describe("UpdateProjectUseCase", () => {
  it("elimina del disco las imágenes que dejaron de usarse", async () => {
    const repository = fakeRepository();
    const files = fakeFiles();
    repository.update.mockResolvedValue({ project: fakeProject(), removedPublicIds: ["old.png"] });
    const input = { ...fakeProject(), units: [{ unitNumber: "1", type: "APARTMENT", status: "AVAILABLE" }], media: [{ url: "a", kind: "IMAGE" }], amenities: [], timeline: [], name: "N", description: "D", currency: "USD", phase: "PRE_SALE", department: "d", province: "p", district: "d", address: "a" };
    await new UpdateProjectUseCase(repository, files).execute("p1", input as never);
    expect(files.remove).toHaveBeenCalledWith(["old.png"]);
  });

  it("falla si el proyecto no existe", async () => {
    const repository = fakeRepository();
    repository.update.mockResolvedValue(null);
    const input = { type: "RESIDENTIAL", phase: "PRE_SALE", units: [{ unitNumber: "1", type: "APARTMENT", status: "AVAILABLE" }], media: [{ url: "a", kind: "IMAGE" }], amenities: [], timeline: [], name: "N", description: "D", department: "d", province: "p", district: "d", address: "a" };
    await expect(new UpdateProjectUseCase(repository, fakeFiles()).execute("x", input as never)).rejects.toBeInstanceOf(ProjectNotFoundError);
  });
});

describe("GetProjectUseCase", () => {
  it.each<ProjectStatus>(["DRAFT", "PAUSED"])("oculta un proyecto %s al público", async (status) => {
    const repository = fakeRepository();
    repository.findBySlug.mockResolvedValue(fakeProject({ status }));
    await expect(new GetProjectUseCase(repository).bySlug("s", false)).rejects.toBeInstanceOf(ProjectNotFoundError);
    await expect(new GetProjectUseCase(repository).bySlug("s", true)).resolves.toBeDefined();
  });

  it("cuenta la vista solo cuando entra el público", async () => {
    const repository = fakeRepository();
    repository.findBySlug.mockResolvedValue(fakeProject());
    await new GetProjectUseCase(repository).bySlug("s", true);
    expect(repository.incrementViews).not.toHaveBeenCalled();
    const visited = await new GetProjectUseCase(repository).bySlug("s", false);
    expect(repository.incrementViews).toHaveBeenCalledWith("p1");
    expect(visited.viewsCount).toBe(1);
  });
});

describe("ListProjectsUseCase", () => {
  it("aplica página y tamaño por defecto y limita el máximo", async () => {
    const repository = fakeRepository();
    repository.findMany.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 12 });
    const list = new ListProjectsUseCase(repository);
    await list.execute({});
    expect(repository.findMany).toHaveBeenLastCalledWith({ page: 1, pageSize: 12 }, false);
    await list.execute({ page: 0, pageSize: 999 }, true);
    expect(repository.findMany).toHaveBeenLastCalledWith({ page: 1, pageSize: 50 }, true);
  });
});

describe("ProjectCommentsUseCase", () => {
  it("no permite comentar un proyecto que no está publicado", async () => {
    const repository = fakeRepository();
    repository.findById.mockResolvedValue(fakeProject({ status: "DRAFT" }));
    await expect(new ProjectCommentsUseCase(repository).add("p1", "Ana", "Hola")).rejects.toBeInstanceOf(ProjectNotFoundError);
  });

  it("limpia el nombre y el texto antes de guardar", async () => {
    const repository = fakeRepository();
    repository.findById.mockResolvedValue(fakeProject());
    repository.addComment.mockResolvedValue({} as never);
    await new ProjectCommentsUseCase(repository).add("p1", "  Ana   María ", "  Muy   buen\n\n\n\nproyecto  ");
    expect(repository.addComment).toHaveBeenCalledWith("p1", "Ana María", "Muy buen\n\nproyecto");
  });

  it("rechaza comentarios vacíos", async () => {
    const repository = fakeRepository();
    repository.findById.mockResolvedValue(fakeProject());
    await expect(new ProjectCommentsUseCase(repository).add("p1", "   ", "texto")).rejects.toBeInstanceOf(ProjectValidationError);
  });

  it("falla al borrar un comentario inexistente", async () => {
    const repository = fakeRepository();
    repository.deleteComment.mockResolvedValue(false);
    await expect(new ProjectCommentsUseCase(repository).remove("c1")).rejects.toBeInstanceOf(ProjectNotFoundError);
  });
});

describe("ManageProjectUnitsUseCase", () => {
  it("valida la unidad según el tipo de proyecto", async () => {
    const repository = fakeRepository();
    repository.findById.mockResolvedValue(fakeProject({ type: "LOTIZATION" }));
    await expect(new ManageProjectUnitsUseCase(repository).add("p1", { unitNumber: "1", type: "APARTMENT", status: "AVAILABLE" })).rejects.toBeInstanceOf(ProjectValidationError);
    expect(repository.addUnit).not.toHaveBeenCalled();
  });

  it("falla al actualizar o borrar una unidad inexistente", async () => {
    const repository = fakeRepository();
    repository.findUnitWithProject.mockResolvedValue(null);
    const units = new ManageProjectUnitsUseCase(repository);
    await expect(units.update("u1", { status: "SOLD" })).rejects.toBeInstanceOf(ProjectNotFoundError);
    await expect(units.remove("u1")).rejects.toBeInstanceOf(ProjectNotFoundError);
  });

  it("rechaza identificadores duplicados al agregar o actualizar", async () => {
    const repository = fakeRepository();
    repository.findById.mockResolvedValue(fakeProject({ type: "RESIDENTIAL", units: [{ id: "u1", unitNumber: "101", type: "APARTMENT", status: "AVAILABLE" } as ProjectUnit] }));
    await expect(new ManageProjectUnitsUseCase(repository).add("p1", { unitNumber: "101", type: "APARTMENT", status: "AVAILABLE" })).rejects.toBeInstanceOf(ProjectValidationError);

    repository.findUnitWithProject.mockResolvedValue({ project: fakeProject({ type: "RESIDENTIAL", units: [{ id: "u1", unitNumber: "101", type: "APARTMENT", status: "AVAILABLE" } as ProjectUnit, { id: "u2", unitNumber: "102", type: "APARTMENT", status: "AVAILABLE" } as ProjectUnit] }), unit: { id: "u2", unitNumber: "102", type: "APARTMENT", status: "AVAILABLE" } as ProjectUnit });
    await expect(new ManageProjectUnitsUseCase(repository).update("u2", { unitNumber: "101" })).rejects.toBeInstanceOf(ProjectValidationError);
  });

  it("no elimina unidades vendidas", async () => {
    const repository = fakeRepository();
    repository.findUnitWithProject.mockResolvedValue({ project: fakeProject({ type: "RESIDENTIAL", units: [{ id: "u1", unitNumber: "101", type: "APARTMENT", status: "SOLD" } as ProjectUnit] }), unit: { id: "u1", unitNumber: "101", type: "APARTMENT", status: "SOLD" } as ProjectUnit });
    await expect(new ManageProjectUnitsUseCase(repository).remove("u1")).rejects.toBeInstanceOf(ProjectConflictError);
    expect(repository.deleteUnit).not.toHaveBeenCalled();
  });
});
