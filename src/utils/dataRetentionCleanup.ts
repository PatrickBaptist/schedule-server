import { admin, db } from "../repositories/firebaseService";
import { forEachActiveOrganization } from "../services/organizationJobs";
import { isValidScheduleDate } from "./musicLinks";

const AUDIT_RETENTION_MONTHS = 6;
const SPECIAL_SCHEDULE_RETENTION_MONTHS = 13;
const MUSIC_HISTORY_RETENTION_MONTHS = 24;
const MUSIC_LINK_RETENTION_MONTHS = 1;
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

async function addLastUsedAtToExistingMusicHistory(referenceDate: Date, organizationId: string): Promise<number> {
  const migrationRef = db.collection("organizations").doc(organizationId).collection("maintenance").doc(MUSIC_HISTORY_MIGRATION_DOCUMENT);
  const migrationSnapshot = await migrationRef.get();

  if (migrationSnapshot.exists) {
    return 0;
  }

  const musicSnapshot = await db.collection("organizations").doc(organizationId).collection("allMusicLinks").get();
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
  organizationId: string,
  collection: string,
  dateField: string,
  cutoff: Date | string,
  isEligible?: (data: FirebaseFirestore.DocumentData) => boolean
): Promise<CleanupResult> {
  const snapshot = await db.collection("organizations").doc(organizationId).collection(collection)
    .where(dateField, "<", cutoff)
    .orderBy(dateField, "asc")
    .limit(DELETE_LIMIT_PER_COLLECTION)
    .get();

  if (snapshot.empty) {
    return { collection, deleted: 0, hasMore: false };
  }

  const batch = db.batch();
  const expiredDocuments = snapshot.docs.filter(document => !isEligible || isEligible(document.data()));
  expiredDocuments.forEach((document) => batch.delete(document.ref));
  if (expiredDocuments.length > 0) await batch.commit();

  return {
    collection,
    deleted: expiredDocuments.length,
    hasMore: snapshot.size === DELETE_LIMIT_PER_COLLECTION,
  };
}

async function executeOrganizationCleanup(organizationId: string, referenceDate: Date): Promise<CleanupResult[]> {
  const auditCutoff = getRetentionCutoff(referenceDate, AUDIT_RETENTION_MONTHS);
  const specialScheduleCutoff = getRetentionCutoff(
    referenceDate,
    SPECIAL_SCHEDULE_RETENTION_MONTHS
  ).toISOString().slice(0, 10);
  const musicHistoryCutoff = getRetentionCutoff(referenceDate, MUSIC_HISTORY_RETENTION_MONTHS);
  const musicLinkCutoff = getRetentionCutoff(referenceDate, MUSIC_LINK_RETENTION_MONTHS)
    .toISOString().slice(0, 10);

  const migratedMusicDocuments = await addLastUsedAtToExistingMusicHistory(referenceDate, organizationId);
  if (migratedMusicDocuments > 0) {
    console.log(
      `Migracao de allMusicLinks: lastUsedAt adicionado em ${migratedMusicDocuments} registro(s).`
    );
  }

  console.log(`Iniciando limpeza de dados anteriores a ${specialScheduleCutoff}.`);

  const results = await Promise.all([
    deleteExpiredDocuments(organizationId, "auditLogs", "createdAt", auditCutoff),
    deleteExpiredDocuments(organizationId, "allMusicLinks", "lastUsedAt", musicHistoryCutoff),
    deleteExpiredDocuments(organizationId, "specialSchedules", "data", specialScheduleCutoff),
    deleteExpiredDocuments(organizationId, "musicLinks", "scheduleDate", musicLinkCutoff,
      data => isValidScheduleDate(data.scheduleDate)),
  ]);

  results.forEach(({ collection, deleted, hasMore }) => {
    console.log(
      `Limpeza de ${collection}: ${deleted} registro(s) removido(s)` +
      (hasMore ? "; ainda existem registros antigos para a proxima inicializacao." : ".")
    );
  });

  return results;
}

async function executeDataRetentionCleanup(referenceDate = new Date()): Promise<CleanupResult[]> {
  const results: CleanupResult[] = [];
  await forEachActiveOrganization(async organizationId => {
    results.push(...await executeOrganizationCleanup(organizationId, referenceDate));
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
