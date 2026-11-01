import { Controller, Get } from "@nestjs/common";
import { PROFILE_ROLE_OPTIONS } from "../../shared/profile-role";

@Controller("profiles")
export class ProfilesController {
  @Get("roles")
  listRoles() {
    return PROFILE_ROLE_OPTIONS.map((role) => ({
      ...role,
      capabilities: { canCreateProperties: true, canViewProperties: true },
    }));
  }
}
