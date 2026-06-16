import { Request, Response } from "express";
import { db } from "../repositories/firebaseService";

type AuditMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

type AuditListItem = {
  id: string;
  who: string;
  date: string;
  time: string;
  occurredAt: string;
  action: string;
  actionLabel: string;
  what: string;
  path: string | null;
  method: string | null;
  statusCode: number | null;
};

type AuditListItemInternal = AuditListItem & {
  createdAt: Date;
};

function toDate(value: unknown): Date {
  if (!value) return new Date(0);
  if (value instanceof Date) return value;
  if (typeof value === "string") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? new Date(0) : parsed;
  }
  if (typeof value === "object" && value !== null && "toDate" in value && typeof (value as { toDate: () => Date }).toDate === "function") {
    return (value as { toDate: () => Date }).toDate();
  }
  return new Date(0);
}

function parseDateParam(value: unknown, boundary: "start" | "end"): Date | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const trimmed = value.trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/;

  if (dateOnly.test(trimmed)) {
    const suffix = boundary === "start" ? "T00:00:00-03:00" : "T23:59:59.999-03:00";
    const parsed = new Date(`${trimmed}${suffix}`);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function parseLimit(value: unknown): number | null {
  if (value === undefined || value === null || value === "") {
    return 100;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return null;
  }

  return Math.min(Math.floor(parsed), 500);
}

function parseMethod(value: unknown): AuditMethod | null {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }

  const normalized = value.trim().toUpperCase();
  if (normalized === "GET" || normalized === "POST" || normalized === "PUT" || normalized === "PATCH" || normalized === "DELETE") {
    return normalized;
  }

  return null;
}

function parseStringParam(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function getActionLabel(action: string): string {
  const labels: Record<string, string> = {
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
  };

  return labels[action] || "Requisição";
}

function getActionFallback(method: string | null, statusCode: number | null): string {
  if (!method) return "request";

  const normalized = method.toUpperCase();
  const failed = (statusCode ?? 0) >= 400;

  if (normalized === "POST") return failed ? "create_failed" : "created";
  if (normalized === "PUT" || normalized === "PATCH") return failed ? "update_failed" : "updated";
  if (normalized === "DELETE") return failed ? "delete_failed" : "deleted";
  if (normalized === "GET") return failed ? "read_failed" : "read";

  return failed ? "request_failed" : "request";
}

function extractWhat(summary: unknown, action: string): string | null {
  if (!summary || typeof summary !== "object" || Array.isArray(summary)) {
    return null;
  }

  const record = summary as Record<string, unknown>;
  const what = record.what;
  if (typeof what === "string" && what.trim() !== "") {
    return what.trim();
  }

  const label = record.label;
  if (typeof label === "string" && label.trim() !== "") {
    return label.trim();
  }

  return getActionLabel(action);
}

export class AuditController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const limit = parseLimit(req.query.limit);
      const method = parseMethod(req.query.method);
      const path = parseStringParam(req.query.path);
      const from = parseDateParam(req.query.from, "start");
      const to = parseDateParam(req.query.to, "end");

      if (limit === null) {
        res.status(400).json({ message: "Parâmetro 'limit' inválido.", expected: "Número inteiro entre 1 e 500." });
        return;
      }

      if (req.query.method !== undefined && method === null) {
        res.status(400).json({ message: "Parâmetro 'method' inválido.", expected: "GET, POST, PUT, PATCH ou DELETE." });
        return;
      }

      if (req.query.from !== undefined && from === null) {
        res.status(400).json({ message: "Parâmetro 'from' inválido.", expected: "ISO 8601 ou YYYY-MM-DD." });
        return;
      }

      if (req.query.to !== undefined && to === null) {
        res.status(400).json({ message: "Parâmetro 'to' inválido.", expected: "ISO 8601 ou YYYY-MM-DD." });
        return;
      }

      if (from && to && from.getTime() > to.getTime()) {
        res.status(400).json({ message: "Intervalo de datas inválido.", expected: "'from' deve ser menor ou igual a 'to'." });
        return;
      }

      const scanLimit = Math.max(limit * 8, 200);
      const cappedScanLimit = Math.min(scanLimit, 2000);
      const snapshot = await db.collection("auditLogs").orderBy("createdAt", "desc").limit(cappedScanLimit).get();

      const logs: AuditListItemInternal[] = snapshot.docs
        .map((doc) => {
          const data = doc.data();
          const createdAt = toDate(data.createdAt);
          const methodValue = typeof data.method === "string" ? data.method : null;
          const statusCode = typeof data.statusCode === "number" ? data.statusCode : null;
          const action = typeof data.summary?.action === "string"
            ? data.summary.action
            : getActionFallback(methodValue, statusCode);
          const what = extractWhat(data.summary, action);

          return {
            id: doc.id,
            who: data.actor?.name || "anonymous",
            date: createdAt.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" }),
            time: createdAt.toLocaleTimeString("pt-BR", {
              timeZone: "America/Sao_Paulo",
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            }),
            occurredAt: createdAt.toISOString(),
            action,
            actionLabel: getActionLabel(action),
            what: what || getActionLabel(action),
            path: typeof data.path === "string" ? data.path : null,
            method: methodValue,
            statusCode,
            createdAt,
          };
        })
        .filter((log) => {
          if (method && log.method !== method) return false;
          if (path && !(log.path ?? "").includes(path)) return false;

          const occurredAt = toDate(log.occurredAt);
          if (from && occurredAt.getTime() < from.getTime()) return false;
          if (to && occurredAt.getTime() > to.getTime()) return false;

          return true;
        });

      const paginatedLogs = logs.slice(0, limit).map(({ createdAt: _createdAt, ...log }) => log);

      res.status(200).json({
        count: paginatedLogs.length,
        hasMore: logs.length > limit,
        filters: {
          method,
          path,
          from: from ? from.toISOString() : null,
          to: to ? to.toISOString() : null,
          limit,
        },
        logs: paginatedLogs,
      });
    } catch (error) {
      console.error("Erro ao buscar auditoria:", error);
      res.status(500).json({
        message: "Erro ao buscar auditoria",
        expected: "GET /audit?limit=100&method=POST&path=/users&from=2026-06-01&to=2026-06-30",
      });
    }
  }
}
