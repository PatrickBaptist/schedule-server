import { Router } from 'express';
import { getNotification, postNotification } from '../controllers/notificationController';
import { authorizeRoles } from '../middlewares/authorizatizeAdmin';
import { UserRole } from '../enums/UserRoles';
import { authenticateToken } from '../middlewares/authorizatizeToken';

const router = Router();

router.get('/', getNotification);
router.post('/', authenticateToken, authorizeRoles(UserRole.Admin, UserRole.Leader), postNotification);

export default router;
