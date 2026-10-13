import { Request, Response } from "express";
import { ScheduleRoleService, ScheduleRoleServiceError } from "../services/scheduleRoleService";

const service = new ScheduleRoleService();

function organizationId(req: Request) {
  const id = req.organizationId || req.params.organizationId;
  if (!id) throw new ScheduleRoleServiceError("Organização obrigatória");
  return id;
}

function sendError(res: Response, error: unknown) {
  const status = error instanceof ScheduleRoleServiceError ? error.statusCode : 500;
  res.status(status).json({ message: error instanceof Error ? error.message : "Erro ao processar função" });
}

export class ScheduleRolesController {
  static async list(req: Request, res: Response) {
    try { res.json(await service.list(organizationId(req))); }
    catch (error) { sendError(res, error); }
  }

  static async create(req: Request, res: Response) {
    try { res.status(201).json(await service.create(organizationId(req), req.body?.name)); }
    catch (error) { sendError(res, error); }
  }

  static async update(req: Request, res: Response) {
    try { res.json(await service.update(organizationId(req), req.params.roleId, req.body ?? {})); }
    catch (error) { sendError(res, error); }
  }
}
