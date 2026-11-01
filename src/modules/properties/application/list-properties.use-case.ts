import { Inject, Injectable } from "@nestjs/common";
import { PROPERTY_REPOSITORY, type Property, type PropertyRepository } from "../domain/property";

@Injectable()
export class ListPropertiesUseCase {
  constructor(@Inject(PROPERTY_REPOSITORY) private readonly properties: PropertyRepository) {}

  execute(): Promise<Property[]> {
    return this.properties.findAll();
  }
}
