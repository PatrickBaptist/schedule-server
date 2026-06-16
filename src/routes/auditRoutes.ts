import { Router } from "express";
import { AuditController } from "../controllers/auditController";
import { authenticateToken } from "../middlewares/authorizatizeToken";

const router = Router();

router.get("/", authenticateToken, AuditController.list);

export default router;
