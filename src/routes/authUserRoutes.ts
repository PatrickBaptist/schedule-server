import { Router } from "express";
import { loginUser, meUser, registerUser } from "../controllers/authController";

const router = Router();

router.get("/me", meUser);
router.post("/login", loginUser);
router.post("/register", registerUser);

export default router;
