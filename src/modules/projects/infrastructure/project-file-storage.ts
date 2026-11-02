import { Injectable } from "@nestjs/common";
import { join } from "node:path";
import { ImageFileStorage } from "../../../shared/image-file-storage";

export const PROJECT_UPLOAD_DIRECTORY = join(process.cwd(), "uploads", "projects");

@Injectable()
export class ProjectFileStorage extends ImageFileStorage {
  constructor() {
    super(PROJECT_UPLOAD_DIRECTORY);
  }
}
