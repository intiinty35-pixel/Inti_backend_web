export const PROFILE_ROLES = {
  AGENT: "AGENT",
  ADMINISTRATOR: "ADMINISTRATOR",
  USER: "USER",
} as const;

export type ProfileRole = (typeof PROFILE_ROLES)[keyof typeof PROFILE_ROLES];

export const PROFILE_ROLE_OPTIONS: Array<{ id: ProfileRole; label: string }> = [
  { id: PROFILE_ROLES.AGENT, label: "Agente" },
  { id: PROFILE_ROLES.ADMINISTRATOR, label: "Administrador" },
  { id: PROFILE_ROLES.USER, label: "Usuario" },
];
