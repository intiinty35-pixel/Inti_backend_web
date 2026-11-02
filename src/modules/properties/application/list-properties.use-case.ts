import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PROPERTY_REPOSITORY, type Property, type PropertyRepository } from "../domain/property";

@Injectable()
export class ListPropertiesUseCase {
  constructor(@Inject(PROPERTY_REPOSITORY) private readonly properties: PropertyRepository) {}

  execute(): Promise<Property[]> {
    return this.properties.findAll();
  }

  executeManaged(ownerId?: string): Promise<Property[]> {
    return this.properties.findManaged(ownerId);
  }

  async deleteManaged(id: string, ownerId?: string): Promise<void> {
    if (!(await this.properties.deleteManaged(id, ownerId))) throw new NotFoundException("No se encontró la propiedad.");
  }
}
