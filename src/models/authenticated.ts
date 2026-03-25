import { UserRole } from "../enums/UserRoles";

export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: UserRole;
  canLeadWorship?: boolean;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}