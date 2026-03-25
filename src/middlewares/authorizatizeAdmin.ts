import { Request, Response, NextFunction } from "express";
import { UserRole } from "../enums/UserRoles";

type RoleOptions = {
  exclude?: UserRole[];
};

export function authorizeRoles(...roles: UserRole[]): any;
export function authorizeRoles(options: RoleOptions): any;

export function authorizeRoles(
  ...args: (UserRole | RoleOptions)[]
) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const user = req.user;

    if (!user) {
      res.status(401).json({ message: "Usuário não autenticado" });
      return;
    }

    const roles = Array.isArray(user.roles)
      ? user.roles
      : [user.roles];

    if (args.length === 1 && typeof args[0] === "object" && "exclude" in args[0]) {
      const blockedRoles = (args[0] as RoleOptions).exclude || [];

      const isBlocked = roles.some(r => blockedRoles.includes(r));

      if (isBlocked) {
        res.status(403).json({ message: "Acesso negado" });
        return;
      }

      return next();
    }

    const allowedRoles = args as UserRole[];

    const hasRole = roles.some(r => allowedRoles.includes(r));

    if (!hasRole) {
      res.status(403).json({ message: "Acesso negado" });
      return;
    }

    next();
  };
}
