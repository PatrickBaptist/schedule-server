import { db } from "../repositories/firebaseService";

export async function forEachActiveOrganization(job: (organizationId: string) => Promise<void>) {
  const snapshot = await db.collection("organizations").where("status", "==", "active").get();
  for (const organization of snapshot.docs) await job(organization.id);
}

export async function getEnabledOrganizationUsers(organizationId: string) {
  const members = await db.collection("organizations").doc(organizationId)
    .collection("members").where("status", "==", "enabled").get();
  if (members.empty) return [];
  const identities = await db.getAll(...members.docs.map(member => db.collection("users").doc(member.id)));
  return identities.filter(user => user.exists && user.data()?.status === "enabled").map(user => ({
    id: user.id,
    name: String(user.data()?.name || ""),
    email: String(user.data()?.email || ""),
    birthDate: String(user.data()?.birthDate || ""),
  }));
}

export async function getOrganizationDate(organizationId: string) {
  const organization = await db.collection("organizations").doc(organizationId).get();
  const timezone = organization.data()?.timezone || "America/Sao_Paulo";
  return new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
