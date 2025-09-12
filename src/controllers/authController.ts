import { Request, Response } from "express";
import { AuthService } from "../services/authService";
import { LoginUserDto, RegisterUserDto } from "../dtos/auth.dto";

const authService = new AuthService();

export class AuthController {
  static async login(req: Request, res: Response): Promise<void> {
    try {
      const dto: LoginUserDto = req.body;

      const result = await authService.login(dto);
      res.status(200).json({ result });
    } catch (error: any) {
      res.status(401).json({ message: error.message });
    }
  }

  static async register(req: Request, res: Response): Promise<void> {
    try {
      const dto: RegisterUserDto = req.body;

      const result = await authService.register(dto);
      res.status(201).json({ result });
    } catch (error: any) {
      res.status(401).json({ message: error.message });
    }
  }

  static async me(req: Request, res: Response): Promise<void> {
    try {
      const authHeader = req.headers.authorization;

      if (!authHeader) {
        res.status(401).json({ message: "Token ausente" });
        return;
      }

      const token = authHeader.split(" ")[1];
      if (!token) {
        res.status(401).json({ message: "Token ausente" });
        return;
      }

      const user = await authService.me(token);
      res.status(200).json({ user });
    } catch (error: any) {
      res.status(401).json({ message: error.message });
    }
  }
}