import { Router } from "express";
import { deleteMusicLink, getMusicLinks, addMusicLink, updateMusicLink } from "../controllers/musicListController";
import { authorizeRoles } from "../middlewares/authorizatizeAdmin";
import { UserRole } from "../enums/UserRoles";
import { authenticateToken } from "../middlewares/authorizatizeToken";

const router = Router();

router.get("/", getMusicLinks);
router.post("/", authenticateToken, authorizeRoles(UserRole.Admin, UserRole.Leader, UserRole.Minister, UserRole.Vocal), addMusicLink);
router.put("/:id", authenticateToken, authorizeRoles(UserRole.Admin, UserRole.Leader, UserRole.Minister, UserRole.Vocal, UserRole.Drums, UserRole.Bass, UserRole.Guitar, UserRole.Keyboard, UserRole.Violao), updateMusicLink);
router.delete("/:id", authenticateToken, authorizeRoles(UserRole.Admin, UserRole.Leader, UserRole.Minister), deleteMusicLink);

export default router;