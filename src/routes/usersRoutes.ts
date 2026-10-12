import Router from "express";
import { authenticateToken } from "../middlewares/authorizatizeToken";
import { authorizeRoles } from "../middlewares/authorizatizeAdmin";
import { UserRole } from "../enums/UserRoles";
import { UserController } from "../controllers/usersController";

const router = Router();

router.patch("/me", authenticateToken, UserController.updateMyUser);


export default router;
