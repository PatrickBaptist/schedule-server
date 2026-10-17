import { admin, db } from "../repositories/firebaseService";
import { OrganizationManagementRole } from "../models/organization";
import { OrganizationService } from "./organizationService";
import { EmailService } from "./emailService";

type OrganizationAction =
  | { action: "delete" };

export class AccountService {
  private organizationService = new OrganizationService();

  private async getMemberships(userId: string) {
    return db.collectionGroup("members").where("userId", "==", userId).get();
  }

  async getDeletionOptions(userId: string) {
    const userSnapshot = await db.collection("users").doc(userId).get();
    if (!userSnapshot.exists) throw new Error("Usuário não encontrado");

    const membershipSnapshot = await this.getMemberships(userId);
    const owned = membershipSnapshot.docs.filter(document =>
      document.data().managementRole === OrganizationManagementRole.Owner
    );

    const organizations = await Promise.all(owned.map(async (membershipDocument) => {
      const orgRef = membershipDocument.ref.parent.parent;
      if (!orgRef) return null;
      const [orgSnapshot, membersSnapshot] = await Promise.all([orgRef.get(), orgRef.collection("members").get()]);
      const otherMembers = membersSnapshot.docs.filter(member => member.id !== userId);
      const activeCandidates = orgSnapshot.exists
        ? otherMembers.filter(member => member.data().status === "enabled")
        : [];
      const candidateUsers = await Promise.all(activeCandidates.map(async member => {
        const identity = await db.collection("users").doc(member.id).get();
        const identityData = identity.data();
        return {
          id: member.id,
          nickname: member.data().nickname || identityData?.nickname || identityData?.name || "Membro",
          email: identityData?.email || "",
        };
      }));

      return {
        id: orgRef.id,
        name: String(orgSnapshot.data()?.name || "Organização"),
        otherMembersCount: orgSnapshot.exists ? otherMembers.length : 0,
        transferCandidates: candidateUsers,
      };
    }));

    return { organizations: organizations.filter(Boolean) };
  }

  async deleteAccount(userId: string, confirmationEmail: string, actions: Record<string, OrganizationAction> = {}) {
    const userRef = db.collection("users").doc(userId);
    const userSnapshot = await userRef.get();
    if (!userSnapshot.exists) throw new Error("Usuário não encontrado");
    const userData = userSnapshot.data()!;
    if (String(confirmationEmail || "").trim().toLowerCase() !== String(userData.email || "").trim().toLowerCase()) {
      throw new Error("Digite seu e-mail corretamente para confirmar a exclusão");
    }

    const membershipSnapshot = await this.getMemberships(userId);
    const ownedDocuments = membershipSnapshot.docs.filter(document =>
      document.data().managementRole === OrganizationManagementRole.Owner
    );
    const plans: Array<{ organizationId: string; action: OrganizationAction }> = [];

    for (const membershipDocument of ownedDocuments) {
      const orgRef = membershipDocument.ref.parent.parent;
      if (!orgRef) continue;
      const organizationSnapshot = await orgRef.get();
      const membersSnapshot = await orgRef.collection("members").get();
      const otherMembers = membersSnapshot.docs.filter(member => member.id !== userId);

      if (!organizationSnapshot.exists || otherMembers.length === 0) {
        plans.push({ organizationId: orgRef.id, action: { action: "delete" } });
        continue;
      }

      const action = actions?.[orgRef.id];
      if (!action || action.action !== "delete") {
        throw new Error(`Escolha o que fazer com a organização "${organizationSnapshot.data()?.name || ""}"`);
      }

      plans.push({
        organizationId: orgRef.id,
        action,
      });
    }

    for (const plan of plans) {
      await this.organizationService.deleteOrganization(plan.organizationId, userId);
    }

    const remainingMemberships = await this.getMemberships(userId);
    for (let offset = 0; offset < remainingMemberships.docs.length; offset += 400) {
      const batch = db.batch();
      remainingMemberships.docs.slice(offset, offset + 400).forEach(document => batch.delete(document.ref));
      await batch.commit();
    }

    await admin.auth().deleteUser(userId).catch(error => {
      if ((error as { code?: string }).code !== "auth/user-not-found") throw error;
    });
    await userRef.delete();
    if (userData.email) {
      try {
        await new EmailService().sendAccountDeletedEmail({
          to: userData.email,
          nickname: userData.nickname || null,
        });
      } catch (error) {
        console.error("Conta excluída, mas não foi possível enviar o e-mail de aviso:", error);
      }
    }
    return { message: "Sua conta foi excluída" };
  }
}
