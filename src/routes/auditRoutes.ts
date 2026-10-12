import { Router } from "express";
import { AuditController } from "../controllers/auditController";
import { authenticateToken } from "../middlewares/authorizatizeToken";
import { authorizeRoles } from "../middlewares/authorizatizeAdmin";
import { UserRole } from "../enums/UserRoles";

const router = Router();

router.get("/", authenticateToken, authorizeRoles(UserRole.Admin, UserRole.Leader), AuditController.list);

export default router;
