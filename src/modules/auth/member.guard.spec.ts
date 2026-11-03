import { ExecutionContext, ForbiddenException } from "@nestjs/common";
import { MemberGuard } from "./member.guard";

function contextFor(role: string): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => ({ auth: { role } }) }),
  } as ExecutionContext;
}

describe("MemberGuard", () => {
  const guard = new MemberGuard();

  it("blocks administrators from create and edit routes", () => {
    expect(() => guard.canActivate(contextFor("ADMINISTRATOR"))).toThrow(ForbiddenException);
  });

  it.each(["AGENT", "USER"])("allows %s accounts to manage their own publications", (role) => {
    expect(guard.canActivate(contextFor(role))).toBe(true);
  });
});
