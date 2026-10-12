import { AuthenticatedUser } from "../models/authenticated";
import { RequestOrganizationMembership } from "../models/organization";

declare global {
  namespace Express {
    export interface Request {
      user?: AuthenticatedUser;
      organizationId?: string;
      membership?: RequestOrganizationMembership;
    }
  }
}
