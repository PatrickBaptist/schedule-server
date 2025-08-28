import { Router } from 'express';
import { getNotification, postNotification, getWarnings, postWarnings } from '../controllers/notificationController';
import { authorizeRoles } from '../middlewares/authorizatizeAdmin';
import { UserRole } from '../enums/UserRoles';
import { authenticateToken } from '../middlewares/authorizatizeToken';

const router = Router();

router.get('/', getNotification);
router.get('/warning', getWarnings);

router.post('/', authenticateToken, authorizeRoles(UserRole.Admin, UserRole.Leader), postNotification);
router.post('/warning', authenticateToken, authorizeRoles(UserRole.Admin, UserRole.Leader), postWarnings);

export default router;
