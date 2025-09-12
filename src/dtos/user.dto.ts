// dtos/user.dto.ts
import { UserRole } from "../enums/UserRoles";
import { UserStatus } from "../enums/UserStatus";

export interface UpdateUserDto {
  name?: string;
  email?: string;
  roles?: UserRole[];
  rolesLower?: string[];
  status?: UserStatus;
  passwordHash?: string;
}
