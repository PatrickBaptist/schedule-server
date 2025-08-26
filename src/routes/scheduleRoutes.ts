import { Router } from 'express';
import { getMonthlySchedule, getNextSundaySchedule, upsertSchedule } from '../controllers/scheduleController';
import { authorizeRoles } from '../middlewares/authorizatizeAdmin';
import { UserRole } from '../enums/UserRoles';
import { authenticateToken } from '../middlewares/authorizatizeToken';

const router = Router();

router.get("/next-sunday", getNextSundaySchedule);
router.get("/:month", getMonthlySchedule);
router.post("/", authenticateToken, authorizeRoles(UserRole.Admin, UserRole.Leader, UserRole.Minister), upsertSchedule);

export default router;
