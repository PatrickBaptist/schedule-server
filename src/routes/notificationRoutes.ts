import { Router } from 'express';
import { getNotification, postNotification } from '../controllers/notificationController';

const router = Router();

router.get('/', getNotification);
router.post('/', postNotification);

export default router;
