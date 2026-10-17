import { Request, Response } from "express";
import { AuthService } from "../services/authService";
import { GoogleAuthDto, LoginUserDto, RegisterUserDto } from "../dtos/auth.dto";
import { UserRole } from "../enums/UserRoles";
import { AccountService } from "../services/accountService";

const authService = new AuthService();
const accountService = new AccountService();

export class AuthController {
  static async login(req: Request, res: Response): Promise<void> {
    try {
      const dto: LoginUserDto = req.body;

      const result = await authService.login(dto);
      res.status(200).json( result );
      console.log("Usuário logado")
    } catch (error: any) {
      res.status(401).json({ message: error.message });
    }
  }

  static async register(req: Request, res: Response): Promise<void> {
    try {
      const dto: RegisterUserDto = req.body;

      const result = await authService.register(dto);
      res.status(201).json( result );
      console.log("Usuário cadastrado")
    } catch (error: any) {
      res.status(401).json({ message: error.message });
    }
  }

  static async verifyEmail(req: Request, res: Response): Promise<void> {
    try {
      const result = await authService.verifyEmail(String(req.body?.token || ""));
      res.status(200).json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }

  static async resendEmailVerification(req: Request, res: Response): Promise<void> {
    try {
      const result = await authService.resendEmailVerification(String(req.body?.email || ""));
      res.status(200).json(result);
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }

  static async getAccountDeletionOptions(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId || req.user?.id;
      if (!userId) { res.status(401).json({ message: "Usuário não identificado" }); return; }
      res.status(200).json(await accountService.getDeletionOptions(userId));
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }

  static async deleteAccount(req: Request, res: Response): Promise<void> {
    try {
      const userId = req.user?.userId || req.user?.id;
      if (!userId) { res.status(401).json({ message: "Usuário não identificado" }); return; }
      const actions = req.body?.organizations && typeof req.body.organizations === "object"
        ? req.body.organizations
        : {};
      res.status(200).json(await accountService.deleteAccount(userId, req.body?.confirmationEmail, actions));
    } catch (error: any) {
      res.status(400).json({ message: error.message });
    }
  }

  static async google(req: Request, res: Response): Promise<void> {
    try {
      const dto: GoogleAuthDto = req.body;

      const result = await authService.googleAuth(dto);
      res.status(200).json(result);
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

      if ((user.roles as string[])?.includes(UserRole.Guest)) {
        const { email, ...safeUser } = user;
        res.status(200).json(safeUser);
        return;
      }

      res.status(200).json( user );
    } catch (error: any) {
      res.status(401).json({ message: error.message });
    }
  }

  static async loginGuest(req: Request, res: Response): Promise<void> {
    try {
      const result = await authService.loginGuest();

      res.status(200).json( result );
      console.log("Convidado logado")
    } catch (error: any) {
      res.status(401).json({ message: error.message });
    }
  }
}
