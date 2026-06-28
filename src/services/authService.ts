import { GoogleAuthDto, LoginUserDto, RegisterUserDto } from "../dtos/auth.dto";
import { UserStatus } from "../enums/UserStatus";
import { WorshipUser } from "../models/user";
import { admin, db } from "../repositories/firebaseService";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { EmailService } from "./emailService";
import { UserRole } from "../enums/UserRoles";
import { formatPhone } from "../utils/formatPhone";

export class AuthService {
    private collection;
    private emailService = new EmailService();

    constructor() {
        this.collection = db.collection("users");
    }

    private signToken(user: { id: string; name: string; email: string; roles: string[] }) {
        if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET nao definido");
        }

        return jwt.sign(
            {
                userId: user.id,
                name: user.name,
                email: user.email,
                role: user.roles,
                roles: user.roles,
            },
            process.env.JWT_SECRET,
            { expiresIn: "30d" }
        );
    }

    async login(dto: LoginUserDto) {
        const { email, password } = dto;

        if (!email || !password) {
            throw new Error("Email e senha obrigatorios");
        }

        const userSnap = await this.collection.where("email", "==", email).limit(1).get();

        if (userSnap.empty) {
            throw new Error("Usuario ou senha invalidos");
        }

        const userDoc = userSnap.docs[0];
        const userData = userDoc.data();

        const match = await bcrypt.compare(password, userSnap.docs[0].data().passwordHash);

        if (!match) {
            throw new Error("Usuario ou senha invalidos");
        }

        if (userData.status !== UserStatus.Enabled) {
            throw new Error("Usuario nao esta habilitado para login. Entre em contato com o administrador.");
        }

        const token = this.signToken({
            id: userDoc.id,
            name: userData.name,
            email: userData.email,
            roles: userData.roles,
        });

        return {
            token,
            user: {
                id: userDoc.id,
                name: userData.name,
                email: userData.email,
                roles: userData.roles,
            },
        };
    }

    async googleAuth(dto: GoogleAuthDto) {
        const { idToken } = dto;

        if (!idToken) {
            throw new Error("idToken obrigatorio");
        }

        const decodedToken = await admin.auth().verifyIdToken(idToken);
        const email = decodedToken.email?.trim().toLowerCase();
        const name = decodedToken.name?.trim() || decodedToken.email?.split("@")[0] || "Usuario Google";
        const photoURL = decodedToken.picture || null;
        const firebaseUid = decodedToken.uid || decodedToken.sub || null;

        if (!email) {
            throw new Error("Email nao encontrado no token do Google");
        }

        if (!firebaseUid) {
            throw new Error("UID do Google nao encontrado no token");
        }

        const now = new Date().toISOString();
        const userSnap = await this.collection.where("email", "==", email).limit(1).get();

        let userId = "";
        let userRoles: string[] = [];
        let userStatus: UserStatus = UserStatus.Pending;
        let responsePhotoURL = photoURL;
        let message = "Usuário cadastrado com sucesso";

        if (!userSnap.empty) {
            const userDoc = userSnap.docs[0];
            const existingUser = userDoc.data() as WorshipUser;
            userId = userDoc.id;
            userRoles = Array.isArray(existingUser.roles) && existingUser.roles.length > 0
                ? existingUser.roles.map((role) => String(role))
                : [UserRole.Guest];
            userStatus = (existingUser.status as UserStatus) || UserStatus.Pending;
            responsePhotoURL = existingUser.photoURL ?? photoURL;
            const photoURLToSave = photoURL ?? existingUser.photoURL ?? null;
            if (userStatus === UserStatus.Enabled) {
                message = "Login realizado com sucesso";
            } else {
                message = "Usuário já cadastrado. Aguarde a liberação do líder.";
            }

            await this.collection.doc(userId).update({
                name,
                email,
                photoURL: photoURLToSave,
                firebaseUid,
                provider: "google",
                updatedAt: now,
            });
        } else {
            const newUser: WorshipUser = {
                name,
                nickname: null,
                email,
                birthDate: "",
                passwordHash: "",
                roles: [],
                rolesLower: [],
                status: UserStatus.Pending,
                phone: null,
                joinedAt: now,
                photoURL,
                instruments: [],
                experience: null,
                notes: null,
                canLeadWorship: false,
                firebaseUid,
                provider: "google",
                createdAt: now,
            };

            const docRef = await this.collection.add(newUser);
            userId = docRef.id;
        }

        const token = this.signToken({
            id: userId,
            name,
            email,
            roles: userRoles,
        });

        return {
            token,
            user: {
                id: userId,
                name,
                email,
                roles: userRoles,
                status: userStatus,
                photoURL: responsePhotoURL,
            },
            message,
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
            canLeadWorship = false,
        } = dto;

        if (!name || !email || !birthDate || !password || !roles || !Array.isArray(roles) || roles.length === 0) {
            throw new Error("Campos obrigatorios: nome, email, data de aniversario, senha e funcao");
        }

        const userSnap = await this.collection.where("email", "==", email).get();

        if (!userSnap.empty) {
            throw new Error("Email ja cadastrado");
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const newUser: WorshipUser = {
            name,
            nickname: nickname || null,
            email,
            birthDate,
            passwordHash,
            roles,
            rolesLower: roles.map((r) => r.toLowerCase()),
            status,
            phone: formatPhone(phone),
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
            .map((doc) => doc.data().email)
            .filter(Boolean);

        try {
            await this.emailService.sendLeaderNotification({
                to: emailsToNotify,
                subject: "Novo usuario aguardando aprovacao",
                html: `
                <h2>Novo cadastro realizado</h2>
                <p>O usuario <strong>${name}(${nickname})</strong> foi cadastrado e esta aguardando aprovacao.</p>
                `,
            });
        } catch (error) {
            console.error("Erro ao enviar email de notificacao:", error);
        }

        return { message: "Usuario cadastrado com sucesso", id: docRef.id };
    }

    async me(token: string) {
        if (!process.env.JWT_SECRET) {
            throw new Error("JWT_SECRET nao definido");
        }

        const payload = jwt.verify(token, process.env.JWT_SECRET) as any;
        const userDoc = await this.collection.doc(payload.userId).get();

        if (!userDoc.exists) {
            throw new Error("Usuario nao encontrado");
        }

        const userData = userDoc.data();

        if (userData?.status !== UserStatus.Enabled) {
            throw new Error("Usuario nao esta habilitado para login. Entre em contato com o administrador.");
        }

        return {
            id: userDoc.id,
            name: userData?.name,
            email: userData?.email,
            nickname: userData?.nickname,
            roles: userData?.roles,
            phone: userData?.phone,
            photoURL: userData?.photoURL,
        };
    }

    async loginGuest() {
        const guestEmail = process.env.GUEST_EMAIL;

        if (!guestEmail) {
            throw new Error("Guest nao configurado");
        }

        const userSnap = await this.collection
            .where("email", "==", guestEmail)
            .limit(1)
            .get();

        if (userSnap.empty) {
            throw new Error("Usuario guest nao encontrado");
        }

        const userDoc = userSnap.docs[0];
        const userData = userDoc.data();

        if (userData.status !== UserStatus.Enabled) {
            throw new Error("Usuario guest desabilitado");
        }

        const token = jwt.sign(
            {
                userId: userDoc.id,
                name: userData.name,
                role: userData.roles,
                roles: userData.roles,
            },
            process.env.JWT_SECRET as string,
            { expiresIn: "1d" }
        );

        return {
            token,
            user: {
                id: userDoc.id,
                name: userData.name,
                roles: userData.roles,
            },
        };
    }
}
