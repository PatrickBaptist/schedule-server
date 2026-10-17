import { createHash, randomBytes } from "crypto";
import { CreateInvitationDto, CreateOrganizationDto } from "../dtos/organization.dto";
import { UserStatus } from "../enums/UserStatus";
import {
  InvitationStatus,
  MembershipStatus,
  Organization,
  OrganizationInvitation,
  OrganizationManagementRole,
  OrganizationMember,
  OrganizationStatus,
} from "../models/organization";
import { db } from "../repositories/firebaseService";
import { ScheduleRoleService } from "./scheduleRoleService";
import { EmailService } from "./emailService";

const ORGANIZATIONS_COLLECTION = "organizations";
const ORGANIZATION_SLUGS_COLLECTION = "organizationSlugs";
const MEMBERS_COLLECTION = "members";
const INVITATIONS_COLLECTION = "invitations";

const ALLOWED_INVITATION_ROLES = new Set<OrganizationManagementRole>([
  OrganizationManagementRole.OrganizationAdmin,
  OrganizationManagementRole.Leader,
  OrganizationManagementRole.Member,
]);

export class OrganizationServiceError extends Error {
  constructor(message: string, public readonly statusCode = 400) {
    super(message);
    this.name = "OrganizationServiceError";
  }
}

function normalizeEmail(value: unknown): string {
  const email = typeof value === "string" ? value.trim().toLowerCase() : "";

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new OrganizationServiceError("E-mail do convite inválido");
  }

  return email;
}

function normalizeSlug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

function requireText(value: unknown, field: string, maxLength: number): string {
  const text = typeof value === "string" ? value.trim() : "";

  if (!text) {
    throw new OrganizationServiceError(`${field} é obrigatório`);
  }

  if (text.length > maxLength) {
    throw new OrganizationServiceError(`${field} deve ter no máximo ${maxLength} caracteres`);
  }

  return text;
}

function optionalText(value: unknown, field: string, maxLength: number): string | null {
  if (value === undefined || value === null || value === "") {
    return null;
  }

  return requireText(value, field, maxLength);
}

function validateTimezone(value: unknown): string | null {
  const timezone = optionalText(value, "Fuso horário", 100);

  if (!timezone) {
    return null;
  }

  try {
    new Intl.DateTimeFormat("pt-BR", { timeZone: timezone }).format(new Date());
  } catch {
    throw new OrganizationServiceError("Fuso horário inválido");
  }

  return timezone;
}

function validateExpiration(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new OrganizationServiceError("expiresAt é obrigatório");
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    throw new OrganizationServiceError("expiresAt deve ser uma data válida");
  }

  if (timestamp <= Date.now()) {
    throw new OrganizationServiceError("expiresAt deve estar no futuro");
  }
  if (timestamp > Date.now() + 30 * 86400000) {
    throw new OrganizationServiceError("O convite deve vencer em até 30 dias");
  }

  return new Date(timestamp).toISOString();
}

function validateManagementRole(value: unknown): Exclude<OrganizationManagementRole, OrganizationManagementRole.Owner> {
  const role = value ?? OrganizationManagementRole.Member;

  if (typeof role !== "string" || !ALLOWED_INVITATION_ROLES.has(role as OrganizationManagementRole)) {
    throw new OrganizationServiceError("Função administrativa do convite inválida");
  }

  return role as Exclude<OrganizationManagementRole, OrganizationManagementRole.Owner>;
}

async function validateMusicalRoles(organizationId: string, value: unknown): Promise<string[]> {
  if (value === undefined || value === null) {
    return [];
  }

  if (!Array.isArray(value)) {
    throw new OrganizationServiceError("musicalRoles deve ser uma lista");
  }

  const roles = Array.from(
    new Set(
      value.map((role) => (typeof role === "string" ? role.trim().toLowerCase() : ""))
    )
  );

  const scheduleRoles = await new ScheduleRoleService().list(organizationId);
  const allowedRoles = new Set(scheduleRoles.filter(role => role.active).map(role => role.id));
  if (roles.some((role) => !role || !allowedRoles.has(role))) {
    throw new OrganizationServiceError("Uma ou mais funções musicais são inválidas");
  }

  return roles;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function invitationIsExpired(invitation: Pick<OrganizationInvitation, "expiresAt">): boolean {
  return Date.parse(invitation.expiresAt) <= Date.now();
}

function withoutInvitationSecret(invitation: OrganizationInvitation) {
  const { tokenHash: _tokenHash, ...safeInvitation } = invitation;
  return safeInvitation;
}

function organizationRef(organizationId: string) {
  return db.collection(ORGANIZATIONS_COLLECTION).doc(organizationId);
}

export class OrganizationService {
  async requestOwnershipTransfer(organizationId: string, actorUserId: string, newOwnerId: string) {
    if (!newOwnerId || newOwnerId === actorUserId) {
      throw new OrganizationServiceError("Escolha outro membro para receber a propriedade");
    }
    const orgRef = organizationRef(organizationId);
    const currentOwnerRef = orgRef.collection(MEMBERS_COLLECTION).doc(actorUserId);
    const nextOwnerRef = orgRef.collection(MEMBERS_COLLECTION).doc(newOwnerId);
    const nextOwnerUserRef = db.collection("users").doc(newOwnerId);
    const transferRef = orgRef.collection("ownershipTransfers").doc();
    const transferToken = randomBytes(32).toString("hex");
    const now = new Date().toISOString();

    await db.runTransaction(async transaction => {
      const [orgSnapshot, currentOwner, nextOwner, nextOwnerUser] = await Promise.all([
        transaction.get(orgRef),
        transaction.get(currentOwnerRef),
        transaction.get(nextOwnerRef),
        transaction.get(nextOwnerUserRef),
      ]);
      if (!orgSnapshot.exists || orgSnapshot.data()?.status !== OrganizationStatus.Active) {
        throw new OrganizationServiceError("Organização não encontrada ou desabilitada", 404);
      }
      if (!currentOwner.exists || currentOwner.data()?.managementRole !== OrganizationManagementRole.Owner || currentOwner.data()?.status !== MembershipStatus.Enabled) {
        throw new OrganizationServiceError("Somente o proprietário pode transferir a propriedade", 403);
      }
      if (!nextOwner.exists || nextOwner.data()?.status !== MembershipStatus.Enabled || !nextOwnerUser.exists || nextOwnerUser.data()?.status !== UserStatus.Enabled) {
        throw new OrganizationServiceError("O novo proprietário precisa ser um membro ativo", 400);
      }
      if (orgSnapshot.data()?.pendingOwnershipTransferId) {
        throw new OrganizationServiceError("Já existe um pedido de troca de proprietário aguardando resposta", 409);
      }
      transaction.create(transferRef, {
        organizationId,
        organizationName: orgSnapshot.data()?.name || "Organização",
        requesterId: actorUserId,
        targetUserId: newOwnerId,
        tokenHash: hashToken(transferToken),
        status: "pending",
        createdAt: now,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        updatedAt: now,
      });
      transaction.update(orgRef, { pendingOwnershipTransferId: transferRef.id, updatedAt: now });
    });

    const [organization, targetUser] = await Promise.all([orgRef.get(), nextOwnerUserRef.get()]);
    const targetEmail = String(targetUser.data()?.email || "");
    if (targetEmail) {
      try {
        await new EmailService().sendOwnershipTransferRequestEmail({
          to: targetEmail,
          nickname: targetUser.data()?.nickname,
          organizationName: String(organization.data()?.name || "Organização"),
          token: transferToken,
        });
      } catch (error) {
        console.error("Pedido de troca criado, mas não foi possível avisar o novo proprietário:", error);
      }
    }
    return { message: "Pedido enviado. A propriedade só será transferida quando a outra pessoa aceitar." };
  }

  async previewOwnershipTransferByToken(token: string) {
    if (!token) throw new OrganizationServiceError("O link do pedido está incompleto", 400);
    const matches = await db.collectionGroup("ownershipTransfers").where("tokenHash", "==", hashToken(token)).limit(1).get();
    if (matches.empty) throw new OrganizationServiceError("Este link não é válido", 404);
    const snapshot = matches.docs[0];
    const request = snapshot.data();
    if (request.status !== "pending" || Date.parse(request.expiresAt || "") <= Date.now()) {
      throw new OrganizationServiceError("Este pedido já foi respondido ou venceu", 410);
    }
    return { organizationName: request.organizationName || "Organização", expiresAt: request.expiresAt };
  }

  async respondToOwnershipTransferByToken(token: string, decision: "accept" | "reject") {
    if (!token) throw new OrganizationServiceError("O link do pedido está incompleto", 400);
    const matches = await db.collectionGroup("ownershipTransfers").where("tokenHash", "==", hashToken(token)).limit(1).get();
    if (matches.empty) throw new OrganizationServiceError("Este link não é válido", 404);
    const snapshot = matches.docs[0];
    const request = snapshot.data();
    const organizationRef = snapshot.ref.parent.parent;
    if (!organizationRef) throw new OrganizationServiceError("Organização não encontrada", 404);
    if (Date.parse(request.expiresAt || "") <= Date.now()) throw new OrganizationServiceError("Este pedido venceu", 410);
    return this.respondToOwnershipTransfer(organizationRef.id, snapshot.id, request.targetUserId, decision);
  }

  async listOwnershipTransfers(organizationId: string, actorUserId: string) {
    const orgRef = organizationRef(organizationId);
    const membership = await orgRef.collection(MEMBERS_COLLECTION).doc(actorUserId).get();
    if (!membership.exists || membership.data()?.status !== MembershipStatus.Enabled) {
      throw new OrganizationServiceError("Você não participa desta organização", 403);
    }
    const snapshot = await orgRef.collection("ownershipTransfers").get();
    return snapshot.docs
      .map(document => {
        const { tokenHash: _tokenHash, ...request } = document.data();
        return { id: document.id, ...request };
      })
      .filter((request: any) => request.requesterId === actorUserId || request.targetUserId === actorUserId)
      .sort((a: any, b: any) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  async respondToOwnershipTransfer(organizationId: string, transferId: string, actorUserId: string, decision: "accept" | "reject") {
    if (!["accept", "reject"].includes(decision)) throw new OrganizationServiceError("Resposta inválida");
    const orgRef = organizationRef(organizationId);
    const transferRef = orgRef.collection("ownershipTransfers").doc(transferId);
    const now = new Date().toISOString();
    let requesterId = "";
    let organizationName = "Organização";

    await db.runTransaction(async transaction => {
      const transferSnapshot = await transaction.get(transferRef);
      if (!transferSnapshot.exists) throw new OrganizationServiceError("Pedido não encontrado", 404);
      const request = transferSnapshot.data()!;
      if (request.targetUserId !== actorUserId) throw new OrganizationServiceError("Somente a pessoa convidada pode responder", 403);
      if (request.status !== "pending") throw new OrganizationServiceError("Este pedido já foi respondido", 409);
      if (Date.parse(request.expiresAt || "") <= Date.now()) throw new OrganizationServiceError("Este pedido venceu", 410);
      const requesterRef = orgRef.collection(MEMBERS_COLLECTION).doc(request.requesterId);
      const targetRef = orgRef.collection(MEMBERS_COLLECTION).doc(actorUserId);
      const [orgSnapshot, requester, target, targetUser] = await Promise.all([
        transaction.get(orgRef), transaction.get(requesterRef), transaction.get(targetRef),
        transaction.get(db.collection("users").doc(actorUserId)),
      ]);
      if (!orgSnapshot.exists || orgSnapshot.data()?.status !== OrganizationStatus.Active) throw new OrganizationServiceError("Organização não encontrada ou desabilitada", 404);
      if (orgSnapshot.data()?.pendingOwnershipTransferId !== transferId) throw new OrganizationServiceError("Este pedido não está mais ativo", 409);
      if (!requester.exists || requester.data()?.status !== MembershipStatus.Enabled || requester.data()?.managementRole !== OrganizationManagementRole.Owner) {
        throw new OrganizationServiceError("O proprietário atual não pode mais transferir esta organização", 409);
      }
      if (!target.exists || target.data()?.status !== MembershipStatus.Enabled || !targetUser.exists || targetUser.data()?.status !== UserStatus.Enabled) {
        throw new OrganizationServiceError("Sua participação não está mais ativa", 403);
      }
      requesterId = request.requesterId;
      organizationName = String(orgSnapshot.data()?.name || request.organizationName || "Organização");
      transaction.update(transferRef, { status: decision === "accept" ? "accepted" : "rejected", respondedAt: now, updatedAt: now });
      transaction.update(orgRef, { pendingOwnershipTransferId: null, updatedAt: now });
      if (decision === "accept") {
        transaction.update(targetRef, { managementRole: OrganizationManagementRole.Owner, updatedAt: now });
        transaction.update(requesterRef, { managementRole: OrganizationManagementRole.Member, updatedAt: now });
      }
    });

    const requesterUser = await db.collection("users").doc(requesterId).get();
    const requesterEmail = String(requesterUser.data()?.email || "");
    if (requesterEmail) {
      try {
        await new EmailService().sendOwnershipTransferResponseEmail({
          to: requesterEmail,
          nickname: requesterUser.data()?.nickname,
          organizationName,
          accepted: decision === "accept",
        });
      } catch (error) {
        console.error("Resposta ao pedido salva, mas não foi possível avisar o proprietário anterior:", error);
      }
    }
    return { message: decision === "accept" ? "Você aceitou a propriedade da organização." : "Você recusou o pedido de propriedade." };
  }

  async deleteOrganization(organizationId: string, actorUserId: string) {
    const orgRef = organizationRef(organizationId);
    const ownerRef = orgRef.collection(MEMBERS_COLLECTION).doc(actorUserId);
    const now = new Date().toISOString();
    const [organizationBeforeDeletion, ownerIdentity] = await Promise.all([
      orgRef.get(),
      db.collection("users").doc(actorUserId).get(),
    ]);
    const deletedOrganizationName = String(organizationBeforeDeletion.data()?.name || "Organização");
    const ownerEmail = String(ownerIdentity.data()?.email || "");
    const ownerNickname = ownerIdentity.data()?.nickname || null;

    await db.runTransaction(async transaction => {
      const [orgSnapshot, ownerSnapshot] = await Promise.all([
        transaction.get(orgRef),
        transaction.get(ownerRef),
      ]);
      if (!ownerSnapshot.exists || ownerSnapshot.data()?.managementRole !== OrganizationManagementRole.Owner) {
        throw new OrganizationServiceError("Somente o proprietário pode excluir a organização", 403);
      }
      if (!orgSnapshot.exists) return;

      const orgData = orgSnapshot.data()!;
      if (orgData.status !== OrganizationStatus.Active && orgData.status !== OrganizationStatus.Disabled) {
        throw new OrganizationServiceError("Organização não pode ser excluída neste estado", 409);
      }
      if (orgData.deletionRequestedBy && orgData.deletionRequestedBy !== actorUserId) {
        throw new OrganizationServiceError("A exclusão desta organização já foi iniciada por outra conta", 409);
      }
      if (orgData.status === OrganizationStatus.Active || !orgData.deletionRequestedBy) {
        transaction.update(orgRef, {
          status: OrganizationStatus.Disabled,
          deletionRequestedBy: actorUserId,
          deletionRequestedAt: now,
          updatedAt: now,
        });
        return;
      }
      if (orgData.status !== OrganizationStatus.Disabled || orgData.deletionRequestedBy !== actorUserId) {
        throw new OrganizationServiceError("Organização desabilitada não pode ser excluída por esta conta", 409);
      }
    });

    const slug = String((await orgRef.get()).data()?.slug || "");
    await db.recursiveDelete(orgRef);
    if (slug) {
      await db.collection(ORGANIZATION_SLUGS_COLLECTION).doc(slug).delete().catch(() => undefined);
    } else {
      const staleSlugs = await db.collection(ORGANIZATION_SLUGS_COLLECTION)
        .where("organizationId", "==", organizationId)
        .get();
      if (!staleSlugs.empty) {
        const batch = db.batch();
        staleSlugs.docs.forEach(document => batch.delete(document.ref));
        await batch.commit();
      }
    }
    if (ownerEmail) {
      try {
        await new EmailService().sendOrganizationDeletedEmail({
          to: ownerEmail,
          nickname: ownerNickname,
          organizationName: deletedOrganizationName,
        });
      } catch (error) {
        console.error("Organização excluída, mas não foi possível enviar o e-mail de aviso:", error);
      }
    }
    return { message: "Organização e seus dados foram excluídos" };
  }

  async createOrganization(userId: string, dto: CreateOrganizationDto) {
    const name = requireText(dto.name, "Nome", 120);
    const slug = normalizeSlug(dto.slug || name);

    if (!slug) {
      throw new OrganizationServiceError("Slug da organização inválido");
    }

    const type = optionalText(dto.type, "Tipo", 50);
    const timezone = validateTimezone(dto.timezone);
    const logo = optionalText(dto.logo, "Logo", 2_000);
    const now = new Date().toISOString();
    const orgRef = db.collection(ORGANIZATIONS_COLLECTION).doc();
    const slugRef = db.collection(ORGANIZATION_SLUGS_COLLECTION).doc(slug);
    const memberRef = orgRef.collection(MEMBERS_COLLECTION).doc(userId);
    const userRef = db.collection("users").doc(userId);

    const existingOrganization = await db
      .collection(ORGANIZATIONS_COLLECTION)
      .where("slug", "==", slug)
      .limit(1)
      .get();

    if (!existingOrganization.empty) {
      throw new OrganizationServiceError("Este endereço de organização já está em uso", 409);
    }

    const organization: Organization = {
      name,
      slug,
      type,
      timezone,
      logo,
      status: OrganizationStatus.Active,
      createdBy: userId,
      createdAt: now,
      updatedAt: now,
    };

    const membership: OrganizationMember = {
      userId,
      managementRole: OrganizationManagementRole.Owner,
      musicalRoles: [],
      status: MembershipStatus.Enabled,
      invitedBy: null,
      joinedAt: now,
      createdAt: now,
      updatedAt: now,
    };

    await db.runTransaction(async (transaction) => {
      const userSnapshot = await transaction.get(userRef);
      const slugSnapshot = await transaction.get(slugRef);

      if (!userSnapshot.exists || userSnapshot.data()?.status !== UserStatus.Enabled) {
        throw new OrganizationServiceError("Conta não habilitada", 403);
      }

      if (slugSnapshot.exists) {
        throw new OrganizationServiceError("Este endereço de organização já está em uso", 409);
      }

      transaction.create(orgRef, organization);
      transaction.create(slugRef, {
        organizationId: orgRef.id,
        createdAt: now,
      });
      transaction.create(memberRef, membership);
    });

    return {
      organization: { id: orgRef.id, ...organization },
      membership,
    };
  }

  async listUserOrganizations(userId: string) {
    const membershipsSnapshot = await db
      .collectionGroup(MEMBERS_COLLECTION)
      .where("userId", "==", userId)
      .get();

    const memberships = membershipsSnapshot.docs
      .map((document) => {
        const parentOrganization = document.ref.parent.parent;
        const membership = document.data() as OrganizationMember;

        if (!parentOrganization || membership.status !== MembershipStatus.Enabled) {
          return null;
        }

        return {
          organizationId: parentOrganization.id,
          membership,
          organizationRef: parentOrganization,
        };
      })
      .filter((value): value is NonNullable<typeof value> => value !== null);

    if (memberships.length === 0) {
      return [];
    }

    const organizationSnapshots = await db.getAll(
      ...memberships.map((membership) => membership.organizationRef)
    );

    const organizationsById = new Map(
      organizationSnapshots
        .filter((snapshot) => snapshot.exists)
        .map((snapshot) => [snapshot.id, snapshot.data() as Organization])
    );

    return memberships
      .map(({ organizationId, membership }) => {
        const organization = organizationsById.get(organizationId);

        if (!organization || organization.status !== OrganizationStatus.Active) {
          return null;
        }

        return {
          organization: { id: organizationId, ...organization },
          membership,
        };
      })
      .filter((value): value is NonNullable<typeof value> => value !== null)
      .sort((left, right) => left.organization.name.localeCompare(right.organization.name, "pt-BR"));
  }

  async createInvitation(
    organizationId: string,
    actorUserId: string,
    dto: CreateInvitationDto
  ) {
    const email = normalizeEmail(dto.email);
    const managementRole = validateManagementRole(dto.managementRole);
    const musicalRoles = await validateMusicalRoles(organizationId, dto.musicalRoles);
    const expiresAt = validateExpiration(dto.expiresAt);
    const token = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(token);
    const now = new Date().toISOString();
    const orgRef = organizationRef(organizationId);
    const actorMemberRef = orgRef.collection(MEMBERS_COLLECTION).doc(actorUserId);
    const invitationRef = orgRef.collection(INVITATIONS_COLLECTION).doc();

    const existingPendingInvitations = await orgRef
      .collection(INVITATIONS_COLLECTION)
      .where("email", "==", email)
      .get();

    const hasPendingInvitation = existingPendingInvitations.docs.some((document) => {
      const invitation = document.data() as OrganizationInvitation;
      return invitation.status === InvitationStatus.Pending && !invitationIsExpired(invitation);
    });

    if (hasPendingInvitation) {
      throw new OrganizationServiceError("Já existe um convite pendente para este e-mail", 409);
    }

    const userSnapshot = await db.collection("users").where("email", "==", email).limit(1).get();
    const existingUserId = userSnapshot.empty ? null : userSnapshot.docs[0].id;
    const targetMemberRef = existingUserId
      ? orgRef.collection(MEMBERS_COLLECTION).doc(existingUserId)
      : null;

    const invitation: OrganizationInvitation = {
      email,
      tokenHash,
      status: InvitationStatus.Pending,
      managementRole,
      musicalRoles,
      createdBy: actorUserId,
      createdAt: now,
      updatedAt: now,
      expiresAt,
      acceptedAt: null,
      acceptedBy: null,
      revokedAt: null,
      revokedBy: null,
    };

    await db.runTransaction(async (transaction) => {
      const organizationSnapshot = await transaction.get(orgRef);
      const actorMembershipSnapshot = await transaction.get(actorMemberRef);
      const pendingInvitations = await transaction.get(orgRef.collection(INVITATIONS_COLLECTION).where("email", "==", email));
      const targetMembershipSnapshot = targetMemberRef
        ? await transaction.get(targetMemberRef)
        : null;

      if (
        !organizationSnapshot.exists ||
        organizationSnapshot.data()?.status !== OrganizationStatus.Active
      ) {
        throw new OrganizationServiceError("Organização não encontrada ou desabilitada", 404);
      }

      if (
        !actorMembershipSnapshot.exists ||
        actorMembershipSnapshot.data()?.status !== MembershipStatus.Enabled
      ) {
        throw new OrganizationServiceError("Acesso negado à organização", 403);
      }

      const actorRole = actorMembershipSnapshot.data()?.managementRole as OrganizationManagementRole;
      const canInvite = [
        OrganizationManagementRole.Owner,
        OrganizationManagementRole.OrganizationAdmin,
        OrganizationManagementRole.Leader,
      ].includes(actorRole);

      if (!canInvite) {
        throw new OrganizationServiceError("Você não pode criar convites nesta organização", 403);
      }
      if (pendingInvitations.docs.some(document => {
        const pending = document.data() as OrganizationInvitation;
        return pending.status === InvitationStatus.Pending && !invitationIsExpired(pending);
      })) {
        throw new OrganizationServiceError("Já existe um convite pendente para este e-mail", 409);
      }

      if (
        actorRole === OrganizationManagementRole.Leader &&
        managementRole !== OrganizationManagementRole.Member
      ) {
        throw new OrganizationServiceError(
          "Líderes só podem convidar pessoas como membros",
          403
        );
      }

      if (
        targetMembershipSnapshot?.exists &&
        targetMembershipSnapshot.data()?.status === MembershipStatus.Enabled
      ) {
        throw new OrganizationServiceError("Esta pessoa já faz parte da organização", 409);
      }

      transaction.create(invitationRef, invitation);
    });

    return {
      invitation: { id: invitationRef.id, ...withoutInvitationSecret(invitation) },
      token,
    };
  }

  async listInvitations(organizationId: string) {
    const snapshot = await organizationRef(organizationId)
      .collection(INVITATIONS_COLLECTION)
      .orderBy("createdAt", "desc")
      .get();

    return snapshot.docs.map((document) => {
      const invitation = document.data() as OrganizationInvitation;
      const safeInvitation = withoutInvitationSecret(invitation);

      return {
        id: document.id,
        ...safeInvitation,
        status:
          invitation.status === InvitationStatus.Pending && invitationIsExpired(invitation)
            ? InvitationStatus.Expired
            : invitation.status,
      };
    });
  }

  async revokeInvitation(
    organizationId: string,
    invitationId: string,
    actorUserId: string
  ) {
    const orgRef = organizationRef(organizationId);
    const actorMemberRef = orgRef.collection(MEMBERS_COLLECTION).doc(actorUserId);
    const invitationRef = orgRef.collection(INVITATIONS_COLLECTION).doc(invitationId);
    const now = new Date().toISOString();

    const result = await db.runTransaction(async (transaction) => {
      const actorSnapshot = await transaction.get(actorMemberRef);
      const invitationSnapshot = await transaction.get(invitationRef);

      if (
        !actorSnapshot.exists ||
        actorSnapshot.data()?.status !== MembershipStatus.Enabled
      ) {
        throw new OrganizationServiceError("Acesso negado à organização", 403);
      }

      if (!invitationSnapshot.exists) {
        throw new OrganizationServiceError("Convite não encontrado", 404);
      }

      const actorRole = actorSnapshot.data()?.managementRole as OrganizationManagementRole;
      const invitation = invitationSnapshot.data() as OrganizationInvitation;

      if (
        actorRole === OrganizationManagementRole.Leader &&
        invitation.managementRole !== OrganizationManagementRole.Member
      ) {
        throw new OrganizationServiceError("Líderes não podem revogar este convite", 403);
      }

      if (
        ![
          OrganizationManagementRole.Owner,
          OrganizationManagementRole.OrganizationAdmin,
          OrganizationManagementRole.Leader,
        ].includes(actorRole)
      ) {
        throw new OrganizationServiceError("Você não pode revogar convites", 403);
      }

      if (invitation.status !== InvitationStatus.Pending) {
        throw new OrganizationServiceError("Somente convites pendentes podem ser revogados", 409);
      }

      const updatedInvitation: OrganizationInvitation = {
        ...invitation,
        status: InvitationStatus.Revoked,
        revokedAt: now,
        revokedBy: actorUserId,
        updatedAt: now,
      };

      transaction.update(invitationRef, {
        status: InvitationStatus.Revoked,
        revokedAt: now,
        revokedBy: actorUserId,
        updatedAt: now,
      });

      return updatedInvitation;
    });

    return { id: invitationId, ...withoutInvitationSecret(result) };
  }

  async previewInvitation(slugValue: string, token: string) {
    const { organizationId, organization } = await this.getOrganizationBySlug(slugValue);
    const invitationSnapshot = await this.getInvitationByToken(organizationId, token);
    const invitation = invitationSnapshot.data() as OrganizationInvitation;

    this.assertInvitationCanBeUsed(invitation);

    return {
      organization: {
        id: organizationId,
        name: organization.name,
        slug: organization.slug,
        type: organization.type ?? null,
        logo: organization.logo ?? null,
      },
      expiresAt: invitation.expiresAt,
    };
  }

  async acceptInvitation(slugValue: string, token: string, userId: string) {
    const { organizationId } = await this.getOrganizationBySlug(slugValue);
    const invitationSnapshot = await this.getInvitationByToken(organizationId, token);
    const orgRef = organizationRef(organizationId);
    const invitationRef = invitationSnapshot.ref;
    const userRef = db.collection("users").doc(userId);
    const memberRef = orgRef.collection(MEMBERS_COLLECTION).doc(userId);
    const now = new Date().toISOString();

    const result = await db.runTransaction(async (transaction) => {
      const organizationSnapshot = await transaction.get(orgRef);
      const currentInvitationSnapshot = await transaction.get(invitationRef);
      const userSnapshot = await transaction.get(userRef);
      const membershipSnapshot = await transaction.get(memberRef);

      if (
        !organizationSnapshot.exists ||
        organizationSnapshot.data()?.status !== OrganizationStatus.Active
      ) {
        throw new OrganizationServiceError("Organização não encontrada ou desabilitada", 404);
      }

      if (!currentInvitationSnapshot.exists) {
        throw new OrganizationServiceError("Convite inválido", 404);
      }

      if (!userSnapshot.exists || userSnapshot.data()?.status !== UserStatus.Enabled) {
        throw new OrganizationServiceError("Conta não habilitada", 403);
      }

      const invitation = currentInvitationSnapshot.data() as OrganizationInvitation;
      const existingMembership = membershipSnapshot.exists
        ? (membershipSnapshot.data() as OrganizationMember)
        : null;

      if (
        invitation.status === InvitationStatus.Accepted &&
        invitation.acceptedBy === userId &&
        existingMembership
      ) {
        return {
          organization: organizationSnapshot.data() as Organization,
          membership: existingMembership,
          alreadyAccepted: true,
        };
      }

      this.assertInvitationCanBeUsed(invitation);

      const userEmail = normalizeEmail(userSnapshot.data()?.email);

      if (userEmail !== invitation.email) {
        throw new OrganizationServiceError(
          "Este convite pertence a outro e-mail",
          403
        );
      }

      const membership: OrganizationMember = {
        userId,
        managementRole: invitation.managementRole,
        musicalRoles: invitation.musicalRoles,
        status: MembershipStatus.Enabled,
        invitedBy: invitation.createdBy,
        joinedAt: existingMembership?.joinedAt || now,
        createdAt: existingMembership?.createdAt || now,
        updatedAt: now,
      };

      const finalMembership = existingMembership?.status === MembershipStatus.Enabled ? existingMembership : membership;
      transaction.set(memberRef, finalMembership);
      transaction.update(invitationRef, {
        status: InvitationStatus.Accepted,
        acceptedAt: now,
        acceptedBy: userId,
        updatedAt: now,
      });

      return {
        organization: organizationSnapshot.data() as Organization,
        membership: finalMembership,
        alreadyAccepted: false,
      };
    });

    return {
      organization: { id: organizationId, ...result.organization },
      membership: result.membership,
      alreadyAccepted: result.alreadyAccepted,
    };
  }

  private async getOrganizationBySlug(slugValue: string) {
    const slug = normalizeSlug(slugValue);

    if (!slug || slug !== slugValue.trim().toLowerCase()) {
      throw new OrganizationServiceError("Organização não encontrada", 404);
    }

    const slugSnapshot = await db.collection(ORGANIZATION_SLUGS_COLLECTION).doc(slug).get();
    let organizationId = slugSnapshot.data()?.organizationId as string | undefined;

    if (!organizationId) {
      const organizationQuery = await db
        .collection(ORGANIZATIONS_COLLECTION)
        .where("slug", "==", slug)
        .limit(1)
        .get();

      if (organizationQuery.empty) {
        throw new OrganizationServiceError("Organização não encontrada", 404);
      }

      organizationId = organizationQuery.docs[0].id;
    }

    const organizationSnapshot = await organizationRef(organizationId).get();

    if (
      !organizationSnapshot.exists ||
      organizationSnapshot.data()?.status !== OrganizationStatus.Active
    ) {
      throw new OrganizationServiceError("Organização não encontrada", 404);
    }

    return {
      organizationId,
      organization: organizationSnapshot.data() as Organization,
    };
  }

  private async getInvitationByToken(organizationId: string, token: string) {
    if (!token || token.length > 500) {
      throw new OrganizationServiceError("Convite inválido", 404);
    }

    const tokenHash = hashToken(token);
    const invitationQuery = await organizationRef(organizationId)
      .collection(INVITATIONS_COLLECTION)
      .where("tokenHash", "==", tokenHash)
      .limit(1)
      .get();

    if (invitationQuery.empty) {
      throw new OrganizationServiceError("Convite inválido", 404);
    }

    return invitationQuery.docs[0];
  }

  private assertInvitationCanBeUsed(invitation: OrganizationInvitation): void {
    if (invitation.status !== InvitationStatus.Pending) {
      throw new OrganizationServiceError("Convite não está mais disponível", 410);
    }

    if (invitationIsExpired(invitation)) {
      throw new OrganizationServiceError("Convite expirado", 410);
    }
  }
}
