import { UserRole } from "../enums/UserRoles";

export interface AuthenticatedUser {
  id: string;
  userId?: string;
  name?: string;
  email?: string;
  role: UserRole | UserRole[];
  roles?: UserRole[];
  canLeadWorship?: boolean;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser;
}
