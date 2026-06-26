import { UserRole } from "../enums/UserRoles";
import { UserStatus } from "../enums/UserStatus";

export interface User {
  id: string;
  name: string;
  nickname?: string | null;
  email: string;
  birthDate: string;
  roles: string[];
  status?: string;
  phone?: string | null;
  photoURL?: string | null;

}

export interface UpdateUserDto {
  name?: string;
  email?: string;
  roles?: UserRole[];
  rolesLower?: string[];
  status?: UserStatus;
  passwordHash?: string;
}

export interface UpdateMyUserDto {
  name?: string;
  nickname?: string | null;
  phone?: string | null;
  photoURL?: string | null;
  experience?: string | null;
  notes?: string | null;
  instruments?: string[];
}
