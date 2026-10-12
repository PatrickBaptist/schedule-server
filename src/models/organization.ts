export enum OrganizationStatus {
  Active = "active",
  Disabled = "disabled",
}

export enum OrganizationManagementRole {
  Owner = "owner",
  OrganizationAdmin = "organization_admin",
  Leader = "leader",
  Member = "member",
}

export enum MembershipStatus {
  Enabled = "enabled",
  Disabled = "disabled",
}

export enum InvitationStatus {
  Pending = "pending",
  Accepted = "accepted",
  Revoked = "revoked",
  Expired = "expired",
}

export interface Organization {
  id?: string;
  name: string;
  slug: string;
  type?: string | null;
  timezone?: string | null;
  logo?: string | null;
  status: OrganizationStatus;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationMember {
  userId: string;
  managementRole: OrganizationManagementRole;
  musicalRoles: string[];
  status: MembershipStatus;
  invitedBy?: string | null;
  joinedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrganizationInvitation {
  id?: string;
  email: string;
  tokenHash: string;
  status: InvitationStatus;
  managementRole: Exclude<OrganizationManagementRole, OrganizationManagementRole.Owner>;
  musicalRoles: string[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  acceptedAt?: string | null;
  acceptedBy?: string | null;
  revokedAt?: string | null;
  revokedBy?: string | null;
}

export type RequestOrganizationMembership = OrganizationMember & {
  organizationId: string;
};
