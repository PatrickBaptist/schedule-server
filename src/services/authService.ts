import { GoogleAuthDto, LoginUserDto, RegisterUserDto } from "../dtos/auth.dto";
import { UserStatus } from "../enums/UserStatus";
import { WorshipUser } from "../models/user";
import { admin, db } from "../repositories/firebaseService";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { UserRole } from "../enums/UserRoles";
import { formatPhone } from "../utils/formatPhone";
import { resizeGooglePhotoURL } from "../utils/resizeGooglePhotoURL";
import { createHash, randomBytes } from "crypto";
import { EmailService } from "./emailService";

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
        const email = dto.email?.trim().toLowerCase();
        const password = dto.password;

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

        if (userData.emailVerified === false) {
            throw new Error("Confirme seu e-mail pelo link que enviamos antes de entrar.");
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
            firebaseCustomToken: await admin.auth().createCustomToken(userDoc.id),
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
        const photoURL = resizeGooglePhotoURL(decodedToken.picture || null);
        const firebaseUid = decodedToken.uid || decodedToken.sub || null;

        if (!email) {
            throw new Error("Email nao encontrado no token do Google");
        }

        if (decodedToken.email_verified !== true) {
            throw new Error("Confirme seu e-mail no Google antes de continuar.");
        }

        if (!firebaseUid) {
            throw new Error("UID do Google nao encontrado no token");
        }

        const now = new Date().toISOString();
        const userSnap = await this.collection.where("email", "==", email).limit(1).get();

        let userId = "";
        let userRoles: string[] = [];
        let userStatus: UserStatus = UserStatus.Enabled;
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
            if (userStatus !== UserStatus.Enabled) throw new Error("Conta não habilitada");
            responsePhotoURL = resizeGooglePhotoURL(existingUser.photoURL ?? photoURL);
            const photoURLToSave = photoURL ?? resizeGooglePhotoURL(existingUser.photoURL ?? null);
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
                status: UserStatus.Enabled,
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
                emailVerified: true,
            };

            const docRef = await this.collection.add(newUser);
            userId = docRef.id;
            try {
                await this.emailService.sendWelcomeEmail({ to: email, nickname: null });
            } catch (error) {
                console.error("Falha ao enviar e-mail de boas-vindas:", error);
            }
        }

        const token = this.signToken({
            id: userId,
            name,
            email,
            roles: userRoles,
        });

        return {
            token,
            firebaseCustomToken: await admin.auth().createCustomToken(userId),
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
            email: rawEmail,
            birthDate,
            password,
            phone,
            photoURL,
            joinedAt,
            instruments,
            experience,
            notes,
            canLeadWorship = false,
        } = dto;

        const email = rawEmail?.trim().toLowerCase();
        const roles: string[] = [];
        const status = UserStatus.Pending;
        if (!name || !email || !birthDate || !password) {
            throw new Error("Campos obrigatorios: nome, email, data de aniversario e senha");
        }
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 8) {
            throw new Error("Informe um email valido e uma senha de pelo menos 8 caracteres");
        }

        const userSnap = await this.collection.where("email", "==", email).get();

        if (!userSnap.empty) {
            throw new Error("Email ja cadastrado");
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const verificationToken = randomBytes(32).toString("hex");
        const newUser: WorshipUser = {
            name,
            nickname: nickname || null,
            email,
            birthDate,
            passwordHash,
            roles,
            rolesLower: roles.map((r) => r.toLowerCase()),
            status,
            emailVerified: false,
            emailVerificationTokenHash: createHash("sha256").update(verificationToken).digest("hex"),
            emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
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
        try {
            await this.emailService.sendEmailVerification({ to: email, nickname: nickname || null, token: verificationToken });
        } catch (error) {
            await docRef.delete();
            throw error;
        }

        return { message: "Enviamos um link de confirmação para seu e-mail. Clique nele para concluir o cadastro.", id: docRef.id };
    }

    async verifyEmail(token: string) {
        if (!token || !/^[a-f0-9]{64}$/i.test(token)) throw new Error("Link de confirmação inválido");
        const tokenHash = createHash("sha256").update(token).digest("hex");
        const matches = await this.collection.where("emailVerificationTokenHash", "==", tokenHash).limit(1).get();
        if (matches.empty) throw new Error("Link inválido ou já utilizado. Faça o cadastro novamente.");
        const userRef = matches.docs[0].ref;
        const verification = await db.runTransaction(async (transaction) => {
            const userDoc = await transaction.get(userRef);
            if (!userDoc.exists) throw new Error("Cadastro não encontrado");
            const userData = userDoc.data() as WorshipUser;

            if (userData.emailVerified === true) {
                return { alreadyVerified: true, userData };
            }
            if (userData.emailVerificationTokenHash !== tokenHash) {
                throw new Error("Link inválido ou já utilizado. Faça o cadastro novamente.");
            }
            if (!userData.emailVerificationExpiresAt || new Date(userData.emailVerificationExpiresAt).getTime() < Date.now()) {
                throw new Error("Este link expirou. Faça o cadastro novamente.");
            }

            transaction.update(userRef, {
                emailVerified: true,
                // Retain the hash so duplicate requests can detect that this link was already consumed.
                emailVerificationTokenHash: tokenHash,
                emailVerificationExpiresAt: null,
                status: UserStatus.Enabled,
                emailVerifiedAt: new Date().toISOString(),
            });
            return { alreadyVerified: false, userData };
        });

        if (!verification.alreadyVerified) {
            try {
                await this.emailService.sendWelcomeEmail({ to: verification.userData.email, nickname: verification.userData.nickname });
            } catch (error) {
                console.error("Falha ao enviar e-mail de boas-vindas:", error);
            }
        }
        return { message: "E-mail confirmado. Seu cadastro foi concluído." };
    }

    async resendEmailVerification(emailValue: string) {
        const email = emailValue?.trim().toLowerCase();
        if (!email) throw new Error("Informe seu e-mail");
        const matches = await this.collection.where("email", "==", email).limit(1).get();
        if (matches.empty) return { message: "Se houver um cadastro pendente para este endereço, enviaremos um novo link." };
        const userDoc = matches.docs[0];
        const userData = userDoc.data() as WorshipUser;
        if (userData.emailVerified !== false) return { message: "Se houver um cadastro pendente para este endereço, enviaremos um novo link." };
        const lastSentAt = userData.emailVerificationLastSentAt ? new Date(userData.emailVerificationLastSentAt).getTime() : 0;
        if (Date.now() - lastSentAt < 60_000) return { message: "Se houver um cadastro pendente para este endereço, enviaremos um novo link." };
        const verificationToken = randomBytes(32).toString("hex");
        await userDoc.ref.update({
            emailVerificationTokenHash: createHash("sha256").update(verificationToken).digest("hex"),
            emailVerificationExpiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            emailVerificationLastSentAt: new Date().toISOString(),
        });
        await this.emailService.sendEmailVerification({ to: email, nickname: userData.nickname, token: verificationToken });
        return { message: "Se houver um cadastro pendente para este endereço, enviaremos um novo link." };
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
            birthDate: userData?.birthDate,
            roles: [],
            status: userData?.status,
            firebaseCustomToken: await admin.auth().createCustomToken(userDoc.id),
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
            firebaseCustomToken: await admin.auth().createCustomToken(userDoc.id),
            user: {
                id: userDoc.id,
                name: userData.name,
                roles: userData.roles,
            },
        };
    }
}
