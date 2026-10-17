import { Request, Response, NextFunction } from "express";
import { db } from "../repositories/firebaseService";
import { RequestOrganizationMembership, OrganizationManagementRole } from "../models/organization";

export async function requireOrganizationMembership(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = req.user?.userId || req.user?.id;
    const organizationId = req.params.organizationId;
    if (organizationId?.includes("/")) { res.status(400).json({ message: "Identificador da organização inválido" }); return; }
    if (!userId || !organizationId) { res.status(401).json({ message: "Sessão ou organização ausente" }); return; }
    const ref = db.collection("organizations").doc(organizationId);
    const [org, member] = await Promise.all([ref.get(), ref.collection("members").doc(userId).get()]);
    if (org.data()?.status !== "active" || member.data()?.status !== "enabled") {
      res.status(403).json({ message: "Acesso negado à organização" }); return;
    }
    req.organizationId = organizationId;
    req.membership = { ...member.data(), organizationId } as RequestOrganizationMembership;
    const managementRole = req.membership.managementRole;
    const roles = [...(req.membership.musicalRoles || [])];
    if (["owner", "organization_admin"].includes(managementRole)) roles.push("admin");
    if (managementRole === "leader") roles.push("leader");
    if (managementRole === "guest") roles.push("guest");
    req.user = { ...req.user!, role: roles as any, roles: roles as any };
    next();
  } catch { res.status(503).json({ message: "Não foi possível validar sua participação" }); }
}

export function requireOrganizationManagementRole(...allowed: OrganizationManagementRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.membership || !allowed.includes(req.membership.managementRole)) {
      res.status(403).json({ message: "Permissão insuficiente" }); return;
    }
    next();
  };
}
