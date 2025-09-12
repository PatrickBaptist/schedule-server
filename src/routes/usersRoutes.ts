import Router from "express";
import { authenticateToken } from "../middlewares/authorizatizeToken";
import { authorizeRoles } from "../middlewares/authorizatizeAdmin";
import { UserRole } from "../enums/UserRoles";
import { UserController } from "../controllers/usersController";

const router = Router();

router.get("/", UserController.getAllUsers);
router.get("/all", authenticateToken, authorizeRoles(UserRole.Admin, UserRole.Leader), UserController.getUsers);

router.get("/:id", UserController.getUserById);
router.put("/:id", authenticateToken, authorizeRoles(UserRole.Admin), UserController.updateUser);
router.delete("/:id", authenticateToken, authorizeRoles(UserRole.Admin), UserController.deleteUser);

export default router;