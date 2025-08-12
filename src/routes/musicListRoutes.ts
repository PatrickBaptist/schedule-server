import { Router } from "express";
import { deleteMusicLink, getMusicLinks, addMusicLink, updateMusicLink } from "../controllers/musicListController";

const router = Router();

router.get("/", getMusicLinks);
router.post("/", addMusicLink);
router.put("/:id", updateMusicLink);
router.delete("/:id", deleteMusicLink);

export default router;