import Router from "express";
import { authenticateToken } from "../middlewares/authorizatizeToken";
import { authorizeRoles } from "../middlewares/authorizatizeAdmin";
import { UserRole } from "../enums/UserRoles";
import { UserController } from "../controllers/usersController";

const router = Router();

router.get("/", authenticateToken, UserController.getAllUsers);
router.get("/all", authenticateToken, authorizeRoles(UserRole.Admin, UserRole.Leader), UserController.getUsers);
router.patch("/me", authenticateToken, UserController.updateMyUser);

router.get("/:id", UserController.getUserById);
router.patch("/:id", authenticateToken, authorizeRoles(UserRole.Admin, UserRole.Leader), UserController.updateUser);
router.put("/:id", authenticateToken, authorizeRoles(UserRole.Admin, UserRole.Leader), UserController.updateUser);
router.delete("/:id", authenticateToken, authorizeRoles(UserRole.Admin, UserRole.Leader), UserController.deleteUser);

export default router;
