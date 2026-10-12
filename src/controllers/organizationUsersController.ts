import { Request, Response } from "express";
import { admin, db } from "../repositories/firebaseService";
import { getOrganizationRef } from "../repositories/organizationData";
import { UserRole } from "../enums/UserRoles";

type MembershipData = {
  userId?: string;
  managementRole?: string;
  musicalRoles?: string[];
  roles?: string[];
  status?: string;
  nickname?: string | null;
  instruments?: string[];
  canLeadWorship?: boolean;
  lastSeen?: FirebaseFirestore.Timestamp;
  joinedAt?: unknown;
};

const MANAGEMENT_ROLES = new Set(["owner", "organization_admin", "leader", "member"]);
const MEMBER_STATUSES = new Set(["enabled", "pending", "disabled"]);

function getContext(req: Request) {
  const organizationId = req.organizationId || req.params.organizationId;
  if (!organizationId) throw new Error("Organização obrigatória");
  return {
    organizationId,
    members: getOrganizationRef(organizationId).collection("members"),
  };
}

function serializeMember(
  memberId: string,
  membership: MembershipData,
  identity: FirebaseFirestore.DocumentData = {}
) {
  const lastSeenDate = membership.lastSeen?.toDate?.();
  const musicalRoles = Array.isArray(membership.musicalRoles)
    ? membership.musicalRoles
    : Array.isArray(membership.roles) ? membership.roles : [];

  return {
    id: memberId,
    name: identity.name ?? "Usuário",
    nickname: membership.nickname ?? identity.nickname ?? identity.name ?? "Usuário",
    email: identity.email ?? "",
    photoURL: identity.photoURL ?? null,
    birthDate: identity.birthDate ?? null,
    roles: musicalRoles,
    musicalRoles,
    managementRole: membership.managementRole ?? "member",
    status: membership.status ?? "pending",
    instruments: Array.isArray(membership.instruments) ? membership.instruments : [],
    canLeadWorship: Boolean(membership.canLeadWorship),
    isOnline: lastSeenDate
      ? Date.now() - lastSeenDate.getTime() < 5 * 60 * 1000
      : false,
    lastSeen: lastSeenDate?.toISOString() ?? null,
    joinedAt: membership.joinedAt ?? null,
  };
}

async function loadIdentities(memberIds: string[]) {
  if (memberIds.length === 0) return new Map<string, FirebaseFirestore.DocumentData>();
  const snapshots = await db.getAll(...memberIds.map((id) => db.collection("users").doc(id)));
  return new Map(
    snapshots.filter((snapshot) => snapshot.exists).map((snapshot) => [snapshot.id, snapshot.data() ?? {}])
  );
}

export class OrganizationUsersController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const { members } = getContext(req);
      const snapshot = await members.get();
      const identities = await loadIdentities(snapshot.docs.map((document) => document.id));
      const result = snapshot.docs
        .map((document) => serializeMember(
          document.id,
          document.data() as MembershipData,
          identities.get(document.id)
        ))
        .sort((first, second) => first.name.localeCompare(second.name, "pt-BR"));
      res.status(200).json(result);
    } catch (error) {
      console.error("Erro ao listar membros da organização:", error);
      res.status(500).json({ message: "Erro ao buscar membros" });
    }
  }

  static async getById(req: Request, res: Response): Promise<void> {
    try {
      const { members } = getContext(req);
      const memberId = req.params.id;
      const [membership, identity] = await Promise.all([
        members.doc(memberId).get(),
        db.collection("users").doc(memberId).get(),
      ]);

      if (!membership.exists) {
        res.status(404).json({ message: "Membro não encontrado nesta organização" });
        return;
      }

      res.status(200).json(serializeMember(
        memberId,
        membership.data() as MembershipData,
        identity.data()
      ));
    } catch (error) {
      console.error("Erro ao buscar membro:", error);
      res.status(500).json({ message: "Erro ao buscar membro" });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { members } = getContext(req);
      const targetId = req.params.id;
      const targetRef = members.doc(targetId);
      const targetSnapshot = await targetRef.get();

      if (!targetSnapshot.exists) {
        res.status(404).json({ message: "Membro não encontrado nesta organização" });
        return;
      }

      const actorRole = String(req.membership?.managementRole ?? "member");
      const target = targetSnapshot.data() as MembershipData;
      const targetRole = String(target.managementRole ?? "member");
      const requestedManagementRole = req.body?.managementRole;

      if (targetRole === "owner" && actorRole !== "owner") {
        res.status(403).json({ message: "Somente o proprietário pode alterar sua participação" });
        return;
      }

      if (actorRole === "leader" && targetRole !== "member") {
        res.status(403).json({ message: "Líderes só podem gerenciar membros comuns" });
        return;
      }

      if (requestedManagementRole !== undefined) {
        if (!MANAGEMENT_ROLES.has(requestedManagementRole)) {
          res.status(400).json({ message: "Papel administrativo inválido" });
          return;
        }
        if (requestedManagementRole === "owner" && actorRole !== "owner") {
          res.status(403).json({ message: "Somente o proprietário pode transferir propriedade" });
          return;
        }
        if (actorRole === "leader" && requestedManagementRole !== "member") {
          res.status(403).json({ message: "Líder não pode conceder administração" });
          return;
        }
      }

      const requestedStatus = req.body?.status;
      if (targetRole === "owner" && ((requestedManagementRole !== undefined && requestedManagementRole !== "owner") || (requestedStatus !== undefined && requestedStatus !== "enabled"))) {
        res.status(409).json({ message: "O proprietário deve continuar ativo. Transferência de propriedade requer um fluxo próprio." });
        return;
      }
      if (requestedStatus !== undefined && !MEMBER_STATUSES.has(requestedStatus)) {
        res.status(400).json({ message: "Status de membro inválido" });
        return;
      }

      const musicalRoles = Array.isArray(req.body?.musicalRoles)
        ? req.body.musicalRoles
        : Array.isArray(req.body?.roles) ? req.body.roles : undefined;
      const allowedMusicalRoles = Object.values(UserRole).filter(role => ![UserRole.Admin, UserRole.Leader, UserRole.Guest].includes(role));
      if (musicalRoles?.some((role: unknown) => !allowedMusicalRoles.includes(role as UserRole))) {
        res.status(400).json({ message: "Função musical inválida. Administração é definida separadamente." });
        return;
      }
      const update: Record<string, unknown> = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };
      if (requestedManagementRole !== undefined) update.managementRole = requestedManagementRole;
      if (requestedStatus !== undefined) update.status = requestedStatus;
      if (musicalRoles !== undefined) update.musicalRoles = musicalRoles.map(String);
      if (req.body?.nickname !== undefined) update.nickname = req.body.nickname || null;
      if (Array.isArray(req.body?.instruments)) update.instruments = req.body.instruments.map(String);
      if (typeof req.body?.canLeadWorship === "boolean") update.canLeadWorship = req.body.canLeadWorship;

      await targetRef.set(update, { merge: true });
      const updated = await targetRef.get();
      const identity = await db.collection("users").doc(targetId).get();
      res.status(200).json({
        message: "Membro atualizado com sucesso",
        user: serializeMember(targetId, updated.data() as MembershipData, identity.data()),
      });
    } catch (error) {
      console.error("Erro ao atualizar membro:", error);
      res.status(500).json({ message: "Erro ao atualizar membro" });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const { members } = getContext(req);
      const targetId = req.params.id;
      const targetRef = members.doc(targetId);
      const targetSnapshot = await targetRef.get();
      if (!targetSnapshot.exists) {
        res.status(404).json({ message: "Membro não encontrado nesta organização" });
        return;
      }

      const actorRole = String(req.membership?.managementRole ?? "member");
      const targetRole = String(targetSnapshot.data()?.managementRole ?? "member");
      if (targetRole === "owner") {
        res.status(409).json({ message: "Transfira a propriedade antes de remover o proprietário" });
        return;
      }
      if (actorRole === "leader" && targetRole !== "member") {
        res.status(403).json({ message: "Líderes só podem remover membros comuns" });
        return;
      }

      await targetRef.delete();
      res.status(200).json({ message: "Membro removido da organização" });
    } catch (error) {
      console.error("Erro ao remover membro:", error);
      res.status(500).json({ message: "Erro ao remover membro" });
    }
  }

  static async presence(req: Request, res: Response): Promise<void> {
    try {
      const { members } = getContext(req);
      const userId = req.user?.userId || req.user?.id;
      if (!userId) {
        res.status(401).json({ message: "Usuário não autenticado" });
        return;
      }
      await members.doc(userId).set({
        lastSeen: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      res.status(204).send();
    } catch (error) {
      console.error("Erro ao atualizar presença:", error);
      res.status(500).json({ message: "Erro ao atualizar presença" });
    }
  }
}

