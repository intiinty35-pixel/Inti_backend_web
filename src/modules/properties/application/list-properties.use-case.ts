import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { PROPERTY_REPOSITORY, type CreatePropertyData, type Property, type PropertyRepository } from "../domain/property";
import { ImageStorage } from "../../../shared/image-storage";
import { SubscriptionPolicyService } from "../../billing/subscription-policy.service";

@Injectable()
export class ListPropertiesUseCase {
  constructor(
    @Inject(PROPERTY_REPOSITORY) private readonly properties: PropertyRepository,
    private readonly images: ImageStorage,
    private readonly subscriptions: SubscriptionPolicyService,
  ) {}

  execute(): Promise<Property[]> {
    return this.properties.findAll();
  }

  executeManaged(ownerId?: string): Promise<Property[]> {
    return this.properties.findManaged(ownerId);
  }

  async updateManaged(id: string, data: CreatePropertyData, ownerId?: string): Promise<Property> {
    const existing = (await this.properties.findManaged(ownerId)).find((property) => property.id === id);
    if (!existing) throw new NotFoundException("No se encontró la propiedad.");
    if (ownerId) await this.subscriptions.validateEdit(ownerId, id, data.media.length);

    const updated = await this.properties.updateManaged(id, data, ownerId);
    if (!updated) throw new NotFoundException("No se encontró la propiedad.");

    const retainedPublicIds = new Set(updated.media.flatMap((media) => media.publicId ? [media.publicId] : []));
    const removedPublicIds = existing.media.flatMap((media) =>
      media.publicId && !retainedPublicIds.has(media.publicId) ? [media.publicId] : [],
    );
    await this.images.remove(removedPublicIds);
    return updated;
  }

  async deleteManaged(id: string, ownerId?: string): Promise<void> {
    const removed = await this.properties.deleteManaged(id, ownerId);
    if (!removed) throw new NotFoundException("No se encontró la propiedad.");
    await this.images.remove(removed.publicIds);
  }

  async publishManaged(id: string, actor: string): Promise<Property> {
    await this.subscriptions.approve(id, actor);
    const published = (await this.properties.findManaged()).find((property) => property.id === id);
    if (!published) throw new NotFoundException("No se encontró la publicación.");
    return published;
  }
}
