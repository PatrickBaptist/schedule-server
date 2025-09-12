import { UserRole } from "../enums/UserRoles";
import { UserStatus } from "../enums/UserStatus";

export interface WorshipUser {
  id?: string;
  name: string;
  nickname?: string | null;
  email: string;
  passwordHash: string;
  birthDate: string;
  roles: UserRole[] | string[];
  rolesLower: string[];
  status: UserStatus | string;
  phone?: string | null;
  joinedAt?: string;
  photoURL?: string | null;
  instruments?: string[];
  experience?: string | null;
  notes?: string | null;
  canLeadWorship?: boolean;
  createdAt?: string;
}
