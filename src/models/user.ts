import { UserRole } from "../enums/UserRoles";
import { UserStatus } from "../enums/UserStatus";
export interface WorshipUser {
  id?: string;
  name: string;
  nickname?: string;
  email: string;
  passwordHash: string;
  birthDate: string;
  roles: UserRole[];
  rolesLower: string[];
  status: UserStatus;
  phone?: string;
  joinedAt?: string;
  photoURL?: string;
  instruments?: string[];
  experience?: string;
  notes?: string;
  canLeadWorship?: boolean;
  createdAt?: string;
}
