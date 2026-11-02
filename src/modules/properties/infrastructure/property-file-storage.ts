import { Injectable } from "@nestjs/common";
import { join } from "node:path";
import { ImageFileStorage } from "../../../shared/image-file-storage";

export const PROPERTY_UPLOAD_DIRECTORY = join(process.cwd(), "uploads", "properties");

@Injectable()
export class PropertyFileStorage extends ImageFileStorage {
  constructor() {
    super(PROPERTY_UPLOAD_DIRECTORY);
  }
}
