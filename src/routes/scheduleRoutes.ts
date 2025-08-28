import { Router } from 'express';

import { authorizeRoles } from '../middlewares/authorizatizeAdmin';
import { UserRole } from '../enums/UserRoles';
import { authenticateToken } from '../middlewares/authorizatizeToken';
import { deleteSpecialSchedules, getMonthlySchedule, getNextSundaySchedule, getSpecialSchedules, postSpecialSchedules, upsertSchedule } from '../controllers/scheduleController';

const router = Router();

router.get("/next-sunday", getNextSundaySchedule);
router.get("/special-schedule", getSpecialSchedules);
router.get("/:month", getMonthlySchedule);

router.post("/", authenticateToken, authorizeRoles(UserRole.Admin, UserRole.Leader, UserRole.Minister), upsertSchedule);
router.post("/special-schedule", authenticateToken, authorizeRoles(UserRole.Admin, UserRole.Leader),  postSpecialSchedules);

router.delete("/special-schedule", authenticateToken, authorizeRoles(UserRole.Admin, UserRole.Leader), deleteSpecialSchedules);

export default router;
