import Router from "express";
import { deleteUser, getAllUsers, getUserById, getUsers, updateUser } from "../controllers/usersController";
import { authenticateToken } from "../middlewares/authorizatizeToken";
import { authorizeRoles } from "../middlewares/authorizatizeAdmin";
import { UserRole } from "../enums/UserRoles";

const router = Router();

router.get("/", getAllUsers);
router.get("/all", authenticateToken, authorizeRoles(UserRole.Admin, UserRole.Leader), getUsers);

router.get("/:id", getUserById);
router.put("/:id", authenticateToken, authorizeRoles(UserRole.Admin), updateUser);
router.delete("/:id", authenticateToken, authorizeRoles(UserRole.Admin), deleteUser);

export default router;