import { Request, Response } from "express";
import { db } from "../services/firebaseService";
import { UserRole } from "../enums/UserRoles";
import { UserStatus } from "../enums/UserStatus";

export const getAllUsers = async (req: Request, res: Response): Promise<void> => {
    try {
    const usersRef = db.collection("users");
    const snapshot = await usersRef.get();

    if (snapshot.empty) {
      res.status(200).json([]);
      return;
    }

    const users = snapshot.docs.map(doc => {
        const { passwordHash, rolesLower, createdAt, updatedAt, ...data } = doc.data();
        return { id: doc.id, ...data };
    });

    res.status(200).json(users);
  } catch (error) {
    console.error("Erro ao buscar usuários:", error);
    res.status(500).json({ message: "Erro ao buscar usuários" });
  }
};

export const updateUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;
        const data = { ...req.body };

        if (!id) {
            res.status(400).json({ message: "ID do usuário obrigatório" });
            return;
        }

        if (data.passwordHash) {
            delete data.passwordHash;
        }

        if (data.roles) {
            const invalidRoles = data.roles.filter((r: string) => !Object.values(UserRole).includes(r as UserRole));
            if (invalidRoles.length > 0) {
                res.status(400).json({ message: `Roles inválidas: ${invalidRoles.join(", ")}` });
                return;
            }
            data.rolesLower = data.roles.map((r: string) => r.toLowerCase());
        }

        // Validação de status
        if (data.status && !Object.values(UserStatus).includes(data.status)) {
            res.status(400).json({ message: `Status inválido: ${data.status}` });
            return;
        }

        const docRef = db.collection("users").doc(id);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            res.status(404).json({ message: "Usuário não encontrado" });
            return;
        }

        await docRef.update({
            ...data,
            updatedAt: new Date().toISOString(),
        });

        const updatedUserDoc = await docRef.get();
        const { passwordHash, rolesLower, createdAt, updatedAt, ...userData } = updatedUserDoc.data()!;

        res.status(200).json({ message: "Usuário atualizado com sucesso", user: userData });
        console.log("Usuário " + id + " atualizado com sucesso");
    } catch (error) {
        console.error("Erro ao atualizar usuário:", error);
        res.status(500).json({ message: "Erro ao atualizar usuário" });
    }
}

export const deleteUser = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        if (!id) {
            res.status(400).json({ message: "ID do usuário obrigatório" });
            return;
        }

        const docRef = db.collection("users").doc(id);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            res.status(404).json({ message: "Usuário nao encontrado" });
            return;
        }

        await docRef.delete();

        res.status(200).json({ message: "Usuário removido com sucesso" });
        console.log("Usuário " + id + " removido com sucesso");
    } catch (error) {
        console.error("Erro ao deletar usuário:", error);
        res.status(500).json({ message: "Erro ao deletar usuário" });
    }
}

export const getUserById = async (req: Request, res: Response): Promise<void> => {
    try {
        const { id } = req.params;

        if (!id) {
            res.status(400).json({ message: "ID do usuário obrigatório" });
            return;
        }

        const docRef = db.collection("users").doc(id);
        const docSnap = await docRef.get();

        if (!docSnap.exists) {
            res.status(404).json({ message: "Usuário nao encontrado" });
            return;
        }

        const data = docSnap.data()!;

        const {
            passwordHash,
            rolesLower,
            createdAt,
            updatedAt,
            ...user
        } = data;

        const result = {
            id: docSnap.id,
            ...user,
        };

        res.status(200).json(result);
        console.log("Usuário " + id + " encontrado com sucesso");
    } catch (error) {
        console.error("Erro ao buscar usuário:", error);
        res.status(500).json({ message: "Erro ao buscar usuário" });
    }
}

export const getUsers = async (req: Request, res: Response): Promise<void> => {
  try {
    const { status, role } = req.query as { status?: string; role?: string; };

    let queryRef: FirebaseFirestore.Query = db.collection("users");

    if (status) {
        queryRef = queryRef.where("status", "==", status.toLowerCase());
    }

    if (role) {
        queryRef = queryRef.where("roles", "array-contains", role.toLowerCase());
    }

    queryRef = queryRef.orderBy("name");

    const snapshot = await queryRef.get();

    const users = snapshot.docs.map(doc => {
      const { passwordHash, rolesLower, createdAt, updatedAt, ...data } = doc.data();
      return { id: doc.id, ...data };
    });

    res.status(200).json(users);
  } catch (error) {
    console.error("Erro ao buscar usuários:", error);
    res.status(500).json({ message: "Erro ao buscar usuários" });
  }
};