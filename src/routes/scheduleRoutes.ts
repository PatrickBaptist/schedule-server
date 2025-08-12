import { Router } from 'express';
import { getMonthlySchedule, getNextSundaySchedule, upsertSchedule } from '../controllers/scheduleController';

const router = Router();

router.get("/next-sunday", getNextSundaySchedule);
router.get("/:month", getMonthlySchedule);
router.post("/", upsertSchedule);

export default router;
