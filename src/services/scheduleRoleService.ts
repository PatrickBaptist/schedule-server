import { ScheduleRoleDefinition } from "../models/scheduleRole";
import { getOrganizationCollection, getOrganizationRef } from "../repositories/organizationData";

const DEFAULT_ROLES: ScheduleRoleDefinition[] = [
  { id: "minister", name: "Ministro", active: true, order: 10, legacyKey: "minister" },
  { id: "vocal", name: "Vocal", active: true, order: 20, legacyKey: "vocal" },
  { id: "keyboard", name: "Teclado", active: true, order: 30, legacyKey: "teclas" },
  { id: "violao", name: "Violão", active: true, order: 40, legacyKey: "violao" },
  { id: "drums", name: "Bateria", active: true, order: 50, legacyKey: "batera" },
  { id: "bass", name: "Baixo", active: true, order: 60, legacyKey: "bass" },
  { id: "guitar", name: "Guitarra", active: true, order: 70, legacyKey: "guita" },
  { id: "sound", name: "Operador de som", active: true, order: 80, legacyKey: "sound" },
  { id: "lighting", name: "Iluminação", active: true, order: 90 },
  { id: "midia", name: "Mídia", active: true, order: 100 },
  { id: "datashow", name: "Datashow", active: true, order: 110 },
];

export class ScheduleRoleServiceError extends Error {
  constructor(message: string, public readonly statusCode = 400) {
    super(message);
    this.name = "ScheduleRoleServiceError";
  }
}

function normalizeName(value: unknown): string {
  const name = typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
  if (!name) throw new ScheduleRoleServiceError("O nome da função é obrigatório");
  if (name.length > 60) throw new ScheduleRoleServiceError("O nome da função deve ter até 60 caracteres");
  return name;
}

function slugify(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase()
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
}

export class ScheduleRoleService {
  async list(organizationId: string): Promise<ScheduleRoleDefinition[]> {
    const snapshot = await getOrganizationCollection(organizationId, "scheduleRoles").get();
    const stored = new Map(snapshot.docs.map(doc => [doc.id, { id: doc.id, ...doc.data() } as ScheduleRoleDefinition]));
    const roles = DEFAULT_ROLES.map(role => ({ ...role, ...(stored.get(role.id) ?? {}) }));
    for (const role of stored.values()) {
      if (!DEFAULT_ROLES.some(defaultRole => defaultRole.id === role.id)) roles.push(role);
    }
    return roles.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "pt-BR"));
  }

  async create(organizationId: string, value: unknown): Promise<ScheduleRoleDefinition> {
    const name = normalizeName(value);
    const roles = await this.list(organizationId);
    if (roles.some(role => role.name.localeCompare(name, "pt-BR", { sensitivity: "base" }) === 0)) {
      throw new ScheduleRoleServiceError("Já existe uma função com esse nome", 409);
    }

    const baseId = slugify(name);
    if (!baseId) throw new ScheduleRoleServiceError("O nome da função é inválido");
    const collection = getOrganizationCollection(organizationId, "scheduleRoles");
    let id = baseId;
    let suffix = 2;
    while ((await collection.doc(id).get()).exists || roles.some(role => role.id === id)) id = `${baseId}-${suffix++}`;

    const now = new Date().toISOString();
    const role: ScheduleRoleDefinition = {
      id,
      name,
      active: true,
      order: Math.max(0, ...roles.map(item => item.order)) + 10,
      createdAt: now,
      updatedAt: now,
    };
    await collection.doc(id).set(role);
    return role;
  }

  async update(organizationId: string, roleId: string, body: Record<string, unknown>): Promise<ScheduleRoleDefinition> {
    const roles = await this.list(organizationId);
    const current = roles.find(role => role.id === roleId);
    if (!current) throw new ScheduleRoleServiceError("Função não encontrada", 404);
    const name = body.name === undefined ? current.name : normalizeName(body.name);
    if (roles.some(role => role.id !== roleId && role.name.localeCompare(name, "pt-BR", { sensitivity: "base" }) === 0)) {
      throw new ScheduleRoleServiceError("Já existe uma função com esse nome", 409);
    }
    if (body.active !== undefined && typeof body.active !== "boolean") {
      throw new ScheduleRoleServiceError("O estado da função é inválido");
    }
    const updated: ScheduleRoleDefinition = {
      ...current,
      name,
      active: body.active === undefined ? current.active : body.active,
      updatedAt: new Date().toISOString(),
    };
    await getOrganizationCollection(organizationId, "scheduleRoles").doc(roleId).set(updated, { merge: true });
    if (current.active && !updated.active) {
      const organization = getOrganizationRef(organizationId);
      const [members, invitations] = await Promise.all([
        organization.collection("members").get(),
        organization.collection("invitations").get(),
      ]);
      const linkedDocuments = [...members.docs, ...invitations.docs].filter(document => {
        const musicalRoles = document.data().musicalRoles;
        return Array.isArray(musicalRoles) && musicalRoles.includes(roleId);
      });
      await Promise.all(linkedDocuments.map(document => {
        const musicalRoles = (document.data().musicalRoles as string[]).filter(role => role !== roleId);
        return document.ref.set({ musicalRoles, updatedAt: updated.updatedAt }, { merge: true });
      }));
    }
    return updated;
  }
}
