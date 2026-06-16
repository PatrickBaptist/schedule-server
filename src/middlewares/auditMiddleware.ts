import { NextFunction, Request, Response } from "express";
import { admin, db } from "../repositories/firebaseService";

const AUDITED_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
const MAX_DEPTH = 2;
const MAX_ARRAY_ITEMS = 20;
const MAX_OBJECT_KEYS = 25;
const MAX_STRING_LENGTH = 500;

type AuditSummary = string | number | boolean | null | AuditSummary[] | { [key: string]: AuditSummary };

function normalizeRoles(user: Request["user"]): string[] {
  const rawRoles = Array.isArray(user?.roles)
    ? user.roles
    : Array.isArray(user?.role)
      ? user.role
      : user?.role
        ? [user.role]
        : [];

  return rawRoles.map((role) => String(role));
}

function summarizeValue(value: unknown, depth = 0): AuditSummary {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value === "string") {
    const text = value as string;
    return text.length > MAX_STRING_LENGTH ? `${text.slice(0, MAX_STRING_LENGTH)}...` : text;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    const arrayValue = value as unknown[];

    if (depth >= MAX_DEPTH) {
      return `[Array(${arrayValue.length})]`;
    }

    return arrayValue.slice(0, MAX_ARRAY_ITEMS).map((item) => summarizeValue(item, depth + 1));
  }

  if (typeof value === "object") {
    if (depth >= MAX_DEPTH) {
      return "[Object]";
    }

    const objectValue = value as Record<string, unknown>;
    const entries = Object.entries(objectValue).slice(0, MAX_OBJECT_KEYS);

    return entries.reduce((acc, [key, nestedValue]) => {
      acc[key] = summarizeValue(nestedValue, depth + 1);
      return acc;
    }, {} as { [key: string]: AuditSummary });
  }

  return String(value);
}

function resolveActor(req: Request) {
  const user = req.user;
  const roles = normalizeRoles(user);
  const body = req.body as { name?: string; email?: string } | undefined;

  return {
    userId: user?.userId || user?.id || null,
    name: user?.name || body?.name || body?.email || "anonymous",
    email: user?.email || body?.email || null,
    rolesCount: roles.length,
    rolesPreview: roles.slice(0, MAX_ARRAY_ITEMS),
  };
}

function buildAction(method: string, statusCode: number): string {
  const normalized = method.toUpperCase();

  if (normalized === "POST") {
    return statusCode >= 400 ? "create_failed" : "created";
  }

  if (normalized === "PUT" || normalized === "PATCH") {
    return statusCode >= 400 ? "update_failed" : "updated";
  }

  if (normalized === "DELETE") {
    return statusCode >= 400 ? "delete_failed" : "deleted";
  }

  if (normalized === "GET") {
    return statusCode >= 400 ? "read_failed" : "read";
  }

  return statusCode >= 400 ? "request_failed" : "request";
}

function getRouteKind(path: string): "auth" | "users" | "music" | "schedule" | "notification" | "other" {
  if (path.startsWith("/auth")) return "auth";
  if (path.startsWith("/users")) return "users";
  if (path.startsWith("/musicList") || path.startsWith("/allMusicLinks")) return "music";
  if (path.startsWith("/schedule")) return "schedule";
  if (path.startsWith("/notification")) return "notification";
  return "other";
}

function findNamedEntity(payload: AuditSummary | null | undefined, keys: string[]): string | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const record = payload as Record<string, AuditSummary>;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim() !== "") {
      return value.trim();
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      const nested = value as Record<string, AuditSummary>;
      if (typeof nested.name === "string" && nested.name.trim() !== "") {
        return nested.name.trim();
      }
    }
  }

  return null;
}

function buildWhat(
  method: string,
  path: string,
  statusCode: number,
  requestPayload: AuditSummary | null,
  responsePayload: AuditSummary | null,
  actorName: string | null
) {
  const routeKind = getRouteKind(path);
  const action = buildAction(method, statusCode);
  const requestedName = findNamedEntity(requestPayload, ["name", "user", "music", "notification", "text", "evento"]);
  const responseName = findNamedEntity(responsePayload, ["user", "music", "item", "notification", "warning"]);
  const targetName = responseName || requestedName;

  if (routeKind === "auth") {
    if (path.startsWith("/auth/login")) {
      return `${targetName || actorName || "Usuário"} fez login no sistema`;
    }

    if (path.startsWith("/auth/guest")) {
      return `${targetName || actorName || "Convidado"} entrou como convidado`;
    }

    if (path.startsWith("/auth/register")) {
      return `Novo usuário cadastrado${targetName ? `: ${targetName}` : ""}`;
    }
  }

  if (routeKind === "users") {
    if (action === "deleted") {
      return `Deletou usuário${targetName ? `: ${targetName}` : ""}`;
    }

    if (action === "updated") {
      return `Atualizou usuário${targetName ? `: ${targetName}` : ""}`;
    }

    if (action === "created") {
      return `Criou usuário${targetName ? `: ${targetName}` : ""}`;
    }
  }

  if (routeKind === "music") {
    if (action === "deleted") {
      return `Deletou link de música${targetName ? `: ${targetName}` : ""}`;
    }

    if (action === "updated") {
      return `Atualizou link de música${targetName ? `: ${targetName}` : ""}`;
    }

    if (action === "created") {
      return `Criou link de música${targetName ? `: ${targetName}` : ""}`;
    }
  }

  if (routeKind === "schedule") {
    return action === "deleted"
      ? "Deletou escala"
      : action === "updated"
        ? "Atualizou escala"
        : "Salvou escala";
  }

  if (routeKind === "notification") {
    return action === "updated" || action === "created"
      ? "Atualizou notificação"
      : "Alterou notificação";
  }

  if (action === "deleted") return `Deletou item${targetName ? `: ${targetName}` : ""}`;
  if (action === "updated") return `Atualizou item${targetName ? `: ${targetName}` : ""}`;
  if (action === "created") return `Criou item${targetName ? `: ${targetName}` : ""}`;

  return `${actorName || "Usuário"} realizou uma requisição`;
}

function buildSummary(method: string, path: string, statusCode: number, requestPayload: AuditSummary | null, responsePayload: AuditSummary | null, actorName: string | null) {
  const action = buildAction(method, statusCode);
  const label = {
    created: "Criado",
    updated: "Atualizado",
    deleted: "Deletado",
    read: "Consultado",
    create_failed: "Falha na criação",
    update_failed: "Falha na atualização",
    delete_failed: "Falha na deleção",
    read_failed: "Falha na consulta",
    request_failed: "Falha na requisição",
    request: "Requisição",
  }[action] || "Requisição";

  return {
    action,
    label,
    resource: path,
    statusCode,
    what: buildWhat(method, path, statusCode, requestPayload, responsePayload, actorName),
  };
}

export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!AUDITED_METHODS.has(req.method.toUpperCase()) || req.originalUrl.startsWith("/audit")) {
    next();
    return;
  }

  const startedAt = new Date();
  const requestPayload = summarizeValue(req.body);
  const requestQuery = summarizeValue(req.query);
  const originalJson = res.json.bind(res);
  const originalSend = res.send.bind(res);
  let responsePayload: AuditSummary | undefined;

  res.json = ((body: unknown) => {
    responsePayload = summarizeValue(body);
    return originalJson(body);
  }) as typeof res.json;

  res.send = ((body: unknown) => {
    responsePayload = responsePayload ?? summarizeValue(body);
    return originalSend(body);
  }) as typeof res.send;

  res.on("finish", () => {
    const actor = resolveActor(req);
    const occurredAt = startedAt.toISOString();
    const summary = buildSummary(req.method, req.originalUrl, res.statusCode, requestPayload, responsePayload ?? null, actor.name);

    void db.collection("auditLogs").add({
      method: req.method,
      path: req.originalUrl,
      route: req.baseUrl || null,
      statusCode: res.statusCode,
      actor,
      requestPayload,
      requestQuery,
      responsePayload: responsePayload ?? null,
      summary,
      occurredAt,
      createdAt: admin.firestore.Timestamp.fromDate(startedAt),
      createdAtISO: occurredAt,
      ip: req.ip || null,
      userAgent: req.get("user-agent") || null,
    }).catch((error) => {
      console.error("Erro ao registrar auditoria:", error);
    });
  });

  next();
}
