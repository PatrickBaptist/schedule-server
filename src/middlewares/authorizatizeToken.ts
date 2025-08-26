import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { AuthenticatedUser } from "../models/authenticated";

export function authenticateToken(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1]; // Bearer TOKEN

  if (!token) {
    res.status(401).json({ message: "Token não fornecido" });
    return;
  }

  jwt.verify(token, process.env.JWT_SECRET as string, (err, decoded) => {
    if (err) {
      res.status(403).json({ message: "Token inválido" });
      return;
    }

    // Adiciona os dados do JWT ao req.user
    req.user = decoded as AuthenticatedUser;
    next(); // continua para o próximo middleware/rota
  });
}


