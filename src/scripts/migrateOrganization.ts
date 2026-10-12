import { db } from "../repositories/firebaseService";

// Copy-only migration. Run a dry-run first and pass an explicit existing owner ID.
async function main() {
  const args = process.argv.slice(2);
  const option = (name: string) => args.find(arg => arg.startsWith(`${name}=`))?.slice(name.length + 1);
  const organizationId = option("--organization-id");
  const name = option("--name");
  const slug = option("--slug");
  const ownerId = option("--owner-id");
  const apply = args.includes("--apply");
  if (!organizationId || !name || !slug || !ownerId || !/^[a-z0-9-]+$/.test(slug) || organizationId.includes("/")) {
    throw new Error("Informe --organization-id=ID --name=NOME --slug=SLUG --owner-id=ID. Sem --apply, apenas simula.");
  }
  const organization = db.collection("organizations").doc(organizationId);
  const slugRef = db.collection("organizationSlugs").doc(slug);
  const owner = await db.collection("users").doc(ownerId).get();
  if (!owner.exists || owner.data()?.status !== "enabled") throw new Error("Proprietário deve ser uma conta existente e habilitada.");
  const [existingOrg, existingSlug] = await Promise.all([organization.get(), slugRef.get()]);
  if (existingOrg.exists || existingSlug.exists) throw new Error("Destino já existe. Use um destino novo para evitar sobrescrita.");
  const collections = ["schedules", "specialSchedules", "musicLinks", "allMusicLinks", "notifications", "warnings"];
  const users = await db.collection("users").get();
  const snapshots = await Promise.all(collections.map(collection => db.collection(collection).get()));
  const counts = Object.fromEntries(snapshots.map((snapshot, index) => [collections[index], snapshot.size]));
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", organizationId, ownerId, members: users.size, collections: counts, sourceDataDeleted: false }, null, 2));
  if (!apply) return;
  const now = new Date().toISOString();
  const writes: Array<{ ref: FirebaseFirestore.DocumentReference; data: FirebaseFirestore.DocumentData }> = [];
  for (const user of users.docs) {
    const data = user.data();
    const roles: string[] = Array.isArray(data.roles) ? data.roles : [];
    writes.push({ ref: organization.collection("members").doc(user.id), data: {
      userId: user.id,
      managementRole: user.id === ownerId ? "owner" : roles.includes("admin") ? "organization_admin" : roles.includes("leader") ? "leader" : "member",
      musicalRoles: roles.filter(role => !["admin", "leader", "guest"].includes(role)),
      status: data.status === "enabled" && !roles.includes("guest") ? "enabled" : "disabled",
      nickname: data.nickname ?? null, instruments: data.instruments ?? [], canLeadWorship: Boolean(data.canLeadWorship),
      joinedAt: data.joinedAt || now, createdAt: now, updatedAt: now,
    } });
  }
  snapshots.forEach((snapshot, index) => snapshot.docs.forEach(document => {
    writes.push({ ref: organization.collection(collections[index]).doc(document.id), data: document.data() });
  }));
  // The organization is invisible until all documents have been copied.
  await db.runTransaction(async transaction => {
    const [target, slugSnapshot] = await Promise.all([transaction.get(organization), transaction.get(slugRef)]);
    if (target.exists || slugSnapshot.exists) throw new Error("Destino ocupado durante a migração");
    transaction.create(organization, { name, slug, type: "igreja", timezone: "America/Sao_Paulo", status: "disabled", createdBy: ownerId, createdAt: now, updatedAt: now, migrationStatus: "copying" });
    transaction.create(slugRef, { organizationId, createdAt: now });
  });
  for (let offset = 0; offset < writes.length; offset += 400) {
    const batch = db.batch();
    writes.slice(offset, offset + 400).forEach(write => batch.create(write.ref, write.data));
    await batch.commit();
  }
  await organization.update({ status: "active", migrationStatus: "completed", updatedAt: new Date().toISOString() });
  console.log("Cópia concluída. Os documentos originais continuam preservados. Auditoria antiga não foi copiada por conter possíveis segredos.");
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na migração"); process.exitCode = 1; });
