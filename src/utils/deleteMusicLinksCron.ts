import { db } from "../repositories/firebaseService";

export const clearAllMusicLinks = async (): Promise<void> => {
  console.log("Limpando todos os musicLinks...");

  const snapshot = await db.collection("musicLinks").get();

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
