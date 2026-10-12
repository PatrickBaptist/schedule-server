import { OrganizationManagementRole } from "../models/organization";

export interface CreateOrganizationDto {
  name: string;
  slug?: string;
  type?: string | null;
  timezone?: string | null;
  logo?: string | null;
}

export interface CreateInvitationDto {
  email: string;
  managementRole?: Exclude<OrganizationManagementRole, OrganizationManagementRole.Owner>;
  musicalRoles?: string[];
  expiresAt: string;
}
