import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AuthenticatedUser } from "../models/authenticated";
import { db } from "../repositories/firebaseService";

export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token) {
    res.status(401).json({ message: "Token não fornecido" });
    return;
  }

  jwt.verify(token, process.env.JWT_SECRET as string, (err, decoded) => {
    if (err) {
      res.status(403).json({ message: "Token inválido" });
      return;
    }

    const jwtUser = decoded as AuthenticatedUser;

    void (async () => {
      try {
        const userId = jwtUser.userId || jwtUser.id;

        if (!userId) {
          req.user = jwtUser;
          next();
          return;
        }

        const userDoc = await db.collection("users").doc(userId).get();

        if (!userDoc.exists) {
          req.user = jwtUser;
          next();
          return;
        }

        const userData = userDoc.data();
        const roles = Array.isArray(userData?.roles) ? userData.roles : [];

        req.user = {
          ...jwtUser,
          id: userDoc.id,
          userId: userDoc.id,
          name: userData?.name ?? jwtUser.name,
          email: userData?.email ?? jwtUser.email,
          role: roles,
          roles,
          canLeadWorship: userData?.canLeadWorship ?? jwtUser.canLeadWorship,
        };

        next();
      } catch {
        req.user = jwtUser;
        next();
      }
    })();
  });
}
