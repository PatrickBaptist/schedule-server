import { db } from "../repositories/firebaseService";

export const clearMusicLinksIfChanged = async (nextSundayISO: string): Promise<boolean> => {
  const metaRef = db.collection("meta").doc("lastSunday");
  const metaSnap = await metaRef.get();
  const lastSundaySaved = metaSnap.exists ? metaSnap.data()?.date : null;

  if (lastSundaySaved !== nextSundayISO) {
    console.log("Escala do próximo domingo mudou, limpando musicLinks...");

    const snapshotLinks = await db.collection("musicLinks").get();
    const batch = db.batch();
    snapshotLinks.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();

    await metaRef.set({ date: nextSundayISO });

    console.log("musicLinks limpos");
    return true; // indicativo que os links foram limpos
  }

  return false; // nada foi feito
};
