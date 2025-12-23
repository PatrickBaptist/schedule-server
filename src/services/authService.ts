import { LoginUserDto, RegisterUserDto } from "../dtos/auth.dto";
import { UserStatus } from "../enums/UserStatus";
import { WorshipUser } from "../models/user";
import { db } from "../repositories/firebaseService";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { EmailService } from "./emailService";
import { UserRole } from "../enums/UserRoles";

export class AuthService {
    private collection;
    private emailService = new EmailService();

    constructor() {
        this.collection = db.collection("users");
    }

    async login(dto: LoginUserDto) {
        const { email, password } = dto;

        if (!email || !password) {
            throw new Error("Email e senha obrigatórios");
        }

        const userSnap = await this.collection.where("email", "==", email).limit(1).get();

        if (userSnap.empty) {
            throw new Error("Usuário ou senha inválidos");
        }

        const userDoc = userSnap.docs[0];
        const userData = userDoc.data();

        const match = await bcrypt.compare(password, userSnap.docs[0].data().passwordHash);
        
        if (!match) {
            throw new Error("Usuário ou senha inválidos");
        }

        if (userData.status !== UserStatus.Enabled) {
            throw new Error("Usuário não está habilitado para login. Entre em contato com o administrador.");
        }

        if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET não definido");
        }

        const token = jwt.sign({
            userId: userDoc.id, name: userData.name, email: userData.email, role: userData.roles },
            process.env.JWT_SECRET,
            { expiresIn: "30d" }
        );

        return {
            token,
            user: {
                id: userDoc.id,
                name: userData.name,
                email: userData.email,
                roles: userData.roles
            }
        };
    }

    async register(dto: RegisterUserDto) {
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
        } = dto;

        if (!name || !email || !birthDate || !password || !roles || !Array.isArray(roles) || roles.length === 0) {
            throw new Error("Campos obrigatórios: nome, email, data de aniversário, senha e função");
        }

        const userSnap = await this.collection.where("email", "==", email).get();

        if (!userSnap.empty) {
            throw new Error("Email já cadastrado");
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

        const docRef = await this.collection.add(newUser);

        const leadersSnap = await this.collection
            .where("rolesLower", "array-contains-any", [UserRole.Admin, UserRole.Leader])
            .get();

        const emailsToNotify = leadersSnap.docs
            .map(doc => doc.data().email)
            .filter(Boolean);

        try {
            await this.emailService.sendLeaderNotification({
                to: emailsToNotify,
                subject: "Novo usuário aguardando aprovação",
                html: `
                <h2>Novo cadastro realizado</h2>
                <p>O usuário <strong>${name}(${nickname})</strong> foi cadastrado e está aguardando aprovação.</p>
                `
            });
        } catch (error) {
            console.error("Erro ao enviar email de notificação:", error);
        }

        return { message: "Usuário cadastrado com sucesso", id: docRef.id };
    }

    async me(token: string) {
        if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET não definido");
        }

        const payload = jwt.verify(token, process.env.JWT_SECRET) as any;
        const userDoc = await this.collection.doc(payload.userId).get();

        if (!userDoc.exists) {
            throw new Error("Usuário não encontrado");
        }

        const userData = userDoc.data();

        if (userData?.status !== UserStatus.Enabled) {
            throw new Error("Usuário não está habilitado para login. Entre em contato com o administrador.");
        }

        return {
            id: userDoc.id,
            name: userData?.name,
            email: userData?.email,
            nickname: userData?.nickname,
            roles: userData?.roles,
        }
    }
}