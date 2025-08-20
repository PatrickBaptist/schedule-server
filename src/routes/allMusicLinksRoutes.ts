import { Router } from "express";
import { addAllMusicLink, deleteAllMusicLink, getAllMusicLinks, updateAllMusicLink } from "../controllers/allMusicLinksController";

const router = Router();

router.get("/", getAllMusicLinks);
router.post("/", addAllMusicLink);
router.put("/:id", updateAllMusicLink);
router.delete("/:id", deleteAllMusicLink);

export default router;