import { Request, Response } from "express";
import { UserService } from "../services/usersService";
import { UpdateUserDto } from "../dtos/user.dto";

const userService = new UserService();

export class UserController {

    static async getAllUsers(req: Request, res: Response): Promise<void> {
        try {
            const users = await userService.getAllUsers();
            res.status(200).json(users);
        } catch (error) {
            console.error("Erro ao buscar usuários:", error);
            res.status(500).json({ message: "Erro ao buscar usuários" });
        }
    }

    static async getUserById(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;

            const user = await userService.getUserById(id);
            res.status(200).json(user);
        } catch(error: any) {
            res.status(404).json({ message: error.message });
        }
    }

    static async getUsers(req: Request, res: Response): Promise<void> {
        try {
            const { status, role } = req.query as { status?: string; role?: string; };
            
            const users = await userService.getUsers(status, role);
            res.status(200).json(users);
        } catch (error) {
            console.error("Erro ao buscar usuários:", error);
            res.status(500).json({ message: "Erro ao buscar usuários" });
        }
    }

    static async updateUser(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const dto: UpdateUserDto = req.body;

            const updatedUser = await userService.updateUser(id, dto);
            res.status(200).json({ message: "Usuário atualizado com sucesso", user: updatedUser });
        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }


    static async deleteUser(req: Request, res: Response): Promise<void> {
        try {
            const { id } = req.params;
            const result = await userService.deleteUser(id);
            res.status(200).json(result);
        } catch (error: any) {
            res.status(500).json({ message: error.message });
        }
    }
}