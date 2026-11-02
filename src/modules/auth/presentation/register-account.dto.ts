import { IsEmail, IsIn, IsString, Matches, MaxLength, MinLength } from "class-validator";
import { PROFILE_ROLES } from "../../../shared/profile-role";

export class RegisterAccountDto {
  @IsString()
  @MinLength(2)
  @MaxLength(80)
  @Matches(/\S/, { message: "Escribe tu nombre completo." })
  name!: string;

  @IsEmail()
  @MaxLength(254)
  email!: string;

  @IsIn([PROFILE_ROLES.USER, PROFILE_ROLES.AGENT])
  role!: typeof PROFILE_ROLES.USER | typeof PROFILE_ROLES.AGENT;

  @IsString()
  @MinLength(10)
  @MaxLength(128)
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d\s])\S+$/, {
    message: "La contraseña debe incluir mayúscula, minúscula, número y símbolo, sin espacios.",
  })
  password!: string;
}
