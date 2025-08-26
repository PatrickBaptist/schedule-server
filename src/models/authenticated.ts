import { UserRole } from "../enums/UserRoles";

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: UserRole;
  canLeadWorship?: boolean;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}