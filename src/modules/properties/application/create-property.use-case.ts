import { Injectable, Inject } from "@nestjs/common";
import { PROPERTY_REPOSITORY, type CreatePropertyData, type Property, type PropertyRepository } from "../domain/property";

@Injectable()
export class CreatePropertyUseCase {
  constructor(@Inject(PROPERTY_REPOSITORY) private readonly properties: PropertyRepository) {}

  execute(data: CreatePropertyData): Promise<Property> {
    return this.properties.create(data);
  }
}
