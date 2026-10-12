import { db } from "../repositories/firebaseService";
import { getOrganizationCollection } from "../repositories/organizationData";

export const clearAllMusicLinks = async (organizationId: string): Promise<void> => {
  console.log("Limpando todos os musicLinks...");

  const snapshot = await getOrganizationCollection(organizationId, "musicLinks").get();

  if (snapshot.empty) {
    console.log("Nenhum musicLink para apagar");
    return;
  }

  const batch = db.batch();

  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });

  await batch.commit();

  console.log("Todos os musicLinks foram apagados");
};
