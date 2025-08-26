import { Router } from "express";
import { addAllMusicLink, deleteAllMusicLink, getAllMusicLinks, updateAllMusicLink } from "../controllers/allMusicLinksController";
import { authenticateToken } from "../middlewares/authorizatizeToken";
import { authorizeRoles } from "../middlewares/authorizatizeAdmin";
import { UserRole } from "../enums/UserRoles";

const router = Router();

router.get("/", getAllMusicLinks);
router.post("/", authenticateToken, authorizeRoles(UserRole.Admin, UserRole.Leader, UserRole.Minister, UserRole.Vocal), addAllMusicLink);
router.put("/:id", authenticateToken, authorizeRoles(UserRole.Admin, UserRole.Leader, UserRole.Minister, UserRole.Vocal, UserRole.Drums, UserRole.Bass, UserRole.Guitar, UserRole.Keyboard, UserRole.Violao), updateAllMusicLink);
router.delete("/:id", authenticateToken, authorizeRoles(UserRole.Admin, UserRole.Leader, UserRole.Minister), deleteAllMusicLink);

export default router;