import { UpdateUserDto, User } from "../dtos/user.dto";
import { UserRole } from "../enums/UserRoles";
import { UserStatus } from "../enums/UserStatus";
import { db } from "../repositories/firebaseService";

export class UserService {
    private collection;

    constructor() {
        this.collection = db.collection("users");
    }

    async getAllUsers(): Promise<User[]> {
        const snapshot = await this.collection.get();
        if (snapshot.empty) return [];

        return snapshot.docs.map((doc) => {
            const data = doc.data() as Omit<User, "id">;
            return { id: doc.id, ...data };
        });
    }

    async getUserById(id: string) {
        if (!id) throw new Error("ID do usuário obrigatório");
        
        const docRef = this.collection.doc(id);
        const docSnap = await docRef.get();

        if (!docSnap.exists) throw new Error("Usuário não encontrado");

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
        if (!id) throw new Error("ID do usuário obrigatório");
        
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

        const docRef = this.collection.doc(id);
        const docSnap = await docRef.get();

        if (!docSnap.exists) throw new Error("Usuário não encontrado");

        await docRef.update({
            ...data,
            updatedAt: new Date().toISOString(),
        });

        const updatedUserDoc = await docRef.get();
        const { passwordHash, rolesLower, createdAt, updatedAt, ...userData } = updatedUserDoc.data()!;
        
        return { id: updatedUserDoc.id, ...userData };

    }

    async deleteUser(id: string) {

        if (!id) throw new Error("ID do usuário obrigatório");

        const docRef = this.collection.doc(id);
        const docSnap = await docRef.get();

        if (!docSnap.exists) throw new Error("Usuário não encontrado");

        await docRef.delete();

        return { message: "Usuário removido com sucesso" };

    }
}