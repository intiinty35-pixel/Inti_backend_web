import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PROPERTY_REPOSITORY, type Property, type PropertyRepository } from "../domain/property";
import { PropertyFileStorage } from "../infrastructure/property-file-storage";

@Injectable()
export class ListPropertiesUseCase {
  constructor(
    @Inject(PROPERTY_REPOSITORY) private readonly properties: PropertyRepository,
    private readonly files: PropertyFileStorage,
  ) {}

  execute(): Promise<Property[]> {
    return this.properties.findAll();
  }

  executeManaged(ownerId?: string): Promise<Property[]> {
    return this.properties.findManaged(ownerId);
  }

  async deleteManaged(id: string, ownerId?: string): Promise<void> {
    const removed = await this.properties.deleteManaged(id, ownerId);
    if (!removed) throw new NotFoundException("No se encontró la propiedad.");
    await this.files.remove(removed.publicIds);
  }
}
