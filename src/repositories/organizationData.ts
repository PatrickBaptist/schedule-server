import { db } from "./firebaseService";

export const ORGANIZATION_DATA_COLLECTIONS = [
  "users",
  "schedules",
  "specialSchedules",
  "musicLinks",
  "allMusicLinks",
  "notifications",
  "warnings",
  "auditLogs",
  "scheduleRoles",
] as const;

export type OrganizationDataCollection = typeof ORGANIZATION_DATA_COLLECTIONS[number];

export function getOrganizationRef(organizationId: string) {
  if (!organizationId?.trim() || organizationId.includes("/")) {
    throw new Error("Organização obrigatória");
  }

  return db.collection("organizations").doc(organizationId);
}

export function getOrganizationCollection(
  organizationId: string,
  collection: OrganizationDataCollection
) {
  return getOrganizationRef(organizationId).collection(collection);
}

