import { Request, Response } from "express";
import { db } from "../services/firebaseService";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import { WorshipUser } from "../models/user";
import { UserStatus } from "../enums/UserStatus";

export const loginUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ message: "Email e senha são obrigatórios" });
      return;
    }

    const userSnap = await db.collection("users").where("email", "==", email).limit(1).get();

    if (userSnap.empty) {
      res.status(401).json({ message: "Usuário ou senha inválidos" });
      return;
    }

    const userDoc = userSnap.docs[0];
    const userData = userDoc.data();

    const match = await bcrypt.compare(password, userData.passwordHash);
    if (!match) {
      res.status(401).json({ message: "Usuário ou senha inválidos" });
      return;
    }

    if (userData.status !== UserStatus.Enabled) {
      res.status(403).json({ message: "Usuário não está habilitado para login. Entre em contato com o administrador." });
      return;
    }

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET não está definido no .env");
    }

    // Cria token JWT
    const token = jwt.sign(
      { userId: userDoc.id, name: userData.name, email: userData.email, role: userData.roles },
      process.env.JWT_SECRET as string,
      { expiresIn: "30d" }
    );

    res.status(200).json({
      token,
      user: {
        id: userDoc.id,
        email: userData.email,
        name: userData.name,
        role: userData.roles,
      },
    });
    
    console.log("Usuário logado com sucesso");
  } catch (error) {
    console.error("Erro no login:", error);
    res.status(500).json({ message: "Erro ao fazer login", error: String(error) });
  }
};

export const registerUser = async (req: Request, res: Response): Promise<void> => {
  try {
    const {
      name,
      nickname,
      email,
      birthDate,
      password,
      roles,
      status = UserStatus.Pending,
      phone,
      photoURL,
      joinedAt,
      instruments,
      experience,
      notes,
      canLeadWorship = false
    } = req.body;

    if (!name || !email || !birthDate || !password || !roles || !Array.isArray(roles) || roles.length === 0) {
      res.status(400).json({ message: "Campos obrigatórios: nome, email, data de aniversário, senha e função" });
      return;
    }

    const userSnap = await db.collection("users").where("email", "==", email).get();
    if (!userSnap.empty) {
      res.status(409).json({ message: "Email já cadastrado" });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const newUser: WorshipUser = {
      name,
      nickname: nickname || null,
      email,
      birthDate,
      passwordHash,
      roles,
      rolesLower: roles.map(r => r.toLowerCase()),
      status,
      phone: phone || null,
      joinedAt: joinedAt || new Date().toISOString(),
      photoURL: photoURL || null,
      instruments: instruments || [],
      experience: experience || null,
      notes: notes || null,
      canLeadWorship,
      createdAt: new Date().toISOString(),
    };

    // Salva no Firestore
    const docRef = await db.collection("users").add(newUser);

    res.status(201).json({
      message: "Usuário cadastrado com sucesso!",
      id: docRef.id
    });

    console.log("Usuário cadastrado com sucesso!");
  } catch (error) {
    console.error("Erro ao cadastrar usuário:", error);
    res.status(500).json({ message: "Erro ao cadastrar usuário", error: String(error) });
  }
};

export const meUser = async (req: Request, res: Response): Promise<void> => {
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

    if (!process.env.JWT_SECRET) {
      throw new Error("JWT_SECRET não definido");
    }

    // Verifica e decodifica o token
    const payload = jwt.verify(token, process.env.JWT_SECRET) as any;

    // Busca o usuário no Firestore pelo ID do token
    const userDoc = await db.collection("users").doc(payload.userId).get();

    if (!userDoc.exists) {
      res.status(404).json({ message: "Usuário não encontrado" });
      return;
    }

    const userData = userDoc.data();

    res.status(200).json({
      id: userDoc.id,
      email: userData?.email,
      name: userData?.name,
      nickname: userData?.nickname,
      roles: userData?.roles,
    });

  } catch (err) {
    console.error("Erro em /auth/me:", err);
    res.status(401).json({ message: "Token inválido" });
    return;
  }
};
