import { admin, db } from "../repositories/firebaseService";

const AUDIT_RETENTION_MONTHS = 6;
const SPECIAL_SCHEDULE_RETENTION_MONTHS = 13;
const MUSIC_HISTORY_RETENTION_MONTHS = 24;
const DELETE_LIMIT_PER_COLLECTION = 400;
const MUSIC_HISTORY_MIGRATION_DOCUMENT = "allMusicLinksLastUsedAtV1";

interface CleanupResult {
  collection: string;
  deleted: number;
  hasMore: boolean;
}

let cleanupInProgress: Promise<CleanupResult[]> | null = null;

export function getRetentionCutoff(
  referenceDate = new Date(),
  retentionMonths = AUDIT_RETENTION_MONTHS
): Date {
  const cutoff = new Date(referenceDate.getTime());
  const originalDay = cutoff.getUTCDate();

  cutoff.setUTCDate(1);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - retentionMonths);

  const lastDayOfTargetMonth = new Date(Date.UTC(
    cutoff.getUTCFullYear(),
    cutoff.getUTCMonth() + 1,
    0
  )).getUTCDate();

  cutoff.setUTCDate(Math.min(originalDay, lastDayOfTargetMonth));
  return cutoff;
}

async function addLastUsedAtToExistingMusicHistory(referenceDate: Date): Promise<number> {
  const migrationRef = db.collection("maintenance").doc(MUSIC_HISTORY_MIGRATION_DOCUMENT);
  const migrationSnapshot = await migrationRef.get();

  if (migrationSnapshot.exists) {
    return 0;
  }

  const musicSnapshot = await db.collection("allMusicLinks").get();
  const documentsWithoutLastUsedAt = musicSnapshot.docs.filter((document) => {
    const lastUsedAt = document.data().lastUsedAt;
    return lastUsedAt === undefined || lastUsedAt === null;
  });

  for (let index = 0; index < documentsWithoutLastUsedAt.length; index += DELETE_LIMIT_PER_COLLECTION) {
    const batch = db.batch();
    const documents = documentsWithoutLastUsedAt.slice(index, index + DELETE_LIMIT_PER_COLLECTION);

    documents.forEach((document) => {
      batch.set(document.ref, { lastUsedAt: referenceDate }, { merge: true });
    });

    await batch.commit();
  }

  await migrationRef.set({
    completedAt: admin.firestore.Timestamp.fromDate(new Date()),
    referenceDate: admin.firestore.Timestamp.fromDate(referenceDate),
    updatedDocuments: documentsWithoutLastUsedAt.length,
  });

  return documentsWithoutLastUsedAt.length;
}

async function deleteExpiredDocuments(
  collection: string,
  dateField: string,
  cutoff: Date | string
): Promise<CleanupResult> {
  const snapshot = await db.collection(collection)
    .where(dateField, "<", cutoff)
    .orderBy(dateField, "asc")
    .limit(DELETE_LIMIT_PER_COLLECTION)
    .get();

  if (snapshot.empty) {
    return { collection, deleted: 0, hasMore: false };
  }

  const batch = db.batch();
  snapshot.docs.forEach((document) => batch.delete(document.ref));
  await batch.commit();

  return {
    collection,
    deleted: snapshot.size,
    hasMore: snapshot.size === DELETE_LIMIT_PER_COLLECTION,
  };
}

async function executeDataRetentionCleanup(referenceDate = new Date()): Promise<CleanupResult[]> {
  const auditCutoff = getRetentionCutoff(referenceDate, AUDIT_RETENTION_MONTHS);
  const specialScheduleCutoff = getRetentionCutoff(
    referenceDate,
    SPECIAL_SCHEDULE_RETENTION_MONTHS
  ).toISOString().slice(0, 10);
  const musicHistoryCutoff = getRetentionCutoff(referenceDate, MUSIC_HISTORY_RETENTION_MONTHS);

  const migratedMusicDocuments = await addLastUsedAtToExistingMusicHistory(referenceDate);
  if (migratedMusicDocuments > 0) {
    console.log(
      `Migracao de allMusicLinks: lastUsedAt adicionado em ${migratedMusicDocuments} registro(s).`
    );
  }

  console.log(`Iniciando limpeza de dados anteriores a ${specialScheduleCutoff}.`);

  const results = await Promise.all([
    deleteExpiredDocuments("auditLogs", "createdAt", auditCutoff),
    deleteExpiredDocuments("allMusicLinks", "lastUsedAt", musicHistoryCutoff),
    deleteExpiredDocuments("specialSchedules", "data", specialScheduleCutoff),
  ]);

  results.forEach(({ collection, deleted, hasMore }) => {
    console.log(
      `Limpeza de ${collection}: ${deleted} registro(s) removido(s)` +
      (hasMore ? "; ainda existem registros antigos para a proxima inicializacao." : ".")
    );
  });

  return results;
}

export function runDataRetentionCleanup(referenceDate = new Date()): Promise<CleanupResult[]> {
  if (!cleanupInProgress) {
    cleanupInProgress = executeDataRetentionCleanup(referenceDate)
      .finally(() => {
        cleanupInProgress = null;
      });
  }

  return cleanupInProgress;
}
