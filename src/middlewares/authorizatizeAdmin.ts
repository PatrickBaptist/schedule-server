import { Request, Response, NextFunction } from "express";
import { UserRole } from "../enums/UserRoles";

// Middleware genérico de autorização
export function authorizeRoles(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      res.status(401).json({ message: "Usuário não autenticado" });
      return; // apenas interrompe a execução, não retorna Response
    }

    const hasRole = Array.isArray(user.role)
      ? user.role.some(r => allowedRoles.includes(r as UserRole))
      : allowedRoles.includes(user.role as UserRole);

    if (!hasRole) {
      console.log("Acesso negado para o usuário:", user);
      res.status(403).json({ message: "Acesso negado" });
      return; // interrompe a execução
    }

    next(); // usuário autorizado
  };
}
