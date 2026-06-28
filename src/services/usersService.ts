import { UpdateMyUserDto, UpdateUserDto, User } from "../dtos/user.dto";
import { UserRole } from "../enums/UserRoles";
import { UserStatus } from "../enums/UserStatus";
import { db } from "../repositories/firebaseService";
import { formatPhone } from "../utils/formatPhone";

export class UserService {
    private collection;

    constructor() {
        this.collection = db.collection("users");
    }

    async getAllUsers(): Promise<Partial<User>[]> {
        const snapshot = await this.collection.get();
        if (snapshot.empty) return [];

        return snapshot.docs.map((doc) => {
            const data = doc.data();
            const lastSeenDate = data.lastSeen?.toDate();

            const isOnline = lastSeenDate
                ? Date.now() - lastSeenDate.getTime() < 5 * 60 * 1000
                : false;

            return {
                id: doc.id,
                name: data.name,
                nickname: data.nickname,
                email: data.email,
                photoURL: data.photoURL ?? null,
                roles: data.roles,
                status: data.status,
                birthDate: data.birthDate,
                isOnline,
                lastSeen: lastSeenDate?.toISOString(),
            };
        });
    }

    async getGuestViewUsers(): Promise<Partial<User>[]> {
        const snapshot = await this.collection.get();
        if (snapshot.empty) return [];

        return snapshot.docs.map((doc) => {
            const data = doc.data() as Omit<User, "id">;
            return {
                id: doc.id,
                nickname: data.nickname,
                photoURL: data.photoURL ?? null,
                roles: data.roles,
                status: data.status,
            };
        });
    }

    async getUserById(id: string) {
        if (!id) throw new Error("ID do usuário obrigatório");

        const docRef = this.collection.doc(id);
        const docSnap = await docRef.get();

        if (!docSnap.exists) throw new Error("Usuário não encontrado");

        const { passwordHash, rolesLower, createdAt, updatedAt, ...user } = docSnap.data()!;
        return { id: docSnap.id, ...user };
    }

    async getUsers(status?: string, role?: string) {
        let queryRef: FirebaseFirestore.Query = this.collection;

        if (status) {
            queryRef = queryRef.where("status", "==", status.toLowerCase());
        }

        if (role) {
            queryRef = queryRef.where("roles", "array-contains", role.toLowerCase());
        }

        queryRef = queryRef.orderBy("name");

        const snapshot = await queryRef.get();

        return snapshot.docs.map((doc) => {
            const { passwordHash, rolesLower, createdAt, updatedAt, ...data } = doc.data();
            return { id: doc.id, ...data };
        });
    }

    async updateUser(id: string, data: UpdateUserDto) {
        if (!id) throw new Error("ID do usuário obrigatório");

        if (data.passwordHash) delete data.passwordHash;

        if (data.roles) {
            const invalidRoles = data.roles.filter(
                (r) => !Object.values(UserRole).includes(r as UserRole)
            );

            if (invalidRoles.length > 0) {
                throw new Error(`Roles inválidas: ${invalidRoles.join(", ")}`);
            }

            data.rolesLower = data.roles.map((r) => r.toLowerCase());
        }

        if (data.status && !Object.values(UserStatus).includes(data.status)) {
            throw new Error(`Status inválido: ${data.status}`);
        }

        if (data.photoURL === null || (typeof data.photoURL === "string" && data.photoURL.trim() === "")) {
            delete data.photoURL;
        }

        const docRef = this.collection.doc(id);
        const docSnap = await docRef.get();

        if (!docSnap.exists) throw new Error("Usuário não encontrado");

        await docRef.update({
            ...data,
            updatedAt: new Date().toISOString(),
        });

        const updatedUserDoc = await docRef.get();
        const { passwordHash, rolesLower, createdAt, updatedAt, ...userData } = updatedUserDoc.data()!;

        return { id: updatedUserDoc.id, ...userData };
    }

    async updateMyProfile(id: string, data: UpdateMyUserDto) {
        if (!id) throw new Error("ID do usuário obrigatório");

        const docRef = this.collection.doc(id);
        const docSnap = await docRef.get();

        if (!docSnap.exists) throw new Error("Usuário não encontrado");

        const allowedUpdate: Record<string, unknown> = {};
        const allowedFields: Array<keyof UpdateMyUserDto> = [
            "name",
            "nickname",
            "phone",
            "photoURL",
            "birthDate",
            "experience",
            "notes",
            "instruments",
        ];

        for (const field of allowedFields) {
            if (data[field] !== undefined) {
                allowedUpdate[field] = data[field];
            }
        }

        if (typeof allowedUpdate.phone === "string" || allowedUpdate.phone === null) {
            allowedUpdate.phone = formatPhone(allowedUpdate.phone as string | null);
        }

        if (typeof allowedUpdate.photoURL === "string" && allowedUpdate.photoURL.trim() === "") {
            delete allowedUpdate.photoURL;
        }

        if (allowedUpdate.photoURL === null) {
            delete allowedUpdate.photoURL;
        }

        if (typeof allowedUpdate.birthDate === "string" && allowedUpdate.birthDate.trim() === "") {
            delete allowedUpdate.birthDate;
        }

        if (allowedUpdate.birthDate === null) {
            delete allowedUpdate.birthDate;
        }

        if (Object.keys(allowedUpdate).length === 0) {
            throw new Error("Nenhum campo válido para atualização");
        }

        await docRef.update({
            ...allowedUpdate,
            updatedAt: new Date().toISOString(),
        });

        const updatedUserDoc = await docRef.get();
        const { passwordHash, rolesLower, createdAt, updatedAt, ...userData } = updatedUserDoc.data()!;

        return { id: updatedUserDoc.id, ...userData };
    }

    async deleteUser(id: string) {
        if (!id) throw new Error("ID do usuário obrigatório");

        const docRef = this.collection.doc(id);
        const docSnap = await docRef.get();

        if (!docSnap.exists) throw new Error("Usuário não encontrado");

        const userData = docSnap.data();
        await docRef.delete();

        return {
            message: "Usuário removido com sucesso",
            user: {
                id: docSnap.id,
                name: userData?.name ?? null,
                email: userData?.email ?? null,
                roles: userData?.roles ?? [],
            },
        };
    }
}
