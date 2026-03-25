import { Router } from "express";
import { AuthController } from "../controllers/authController";

const router = Router();

router.get("/me", AuthController.me);
router.post("/login", AuthController.login);
router.post("/register", AuthController.register);
router.post("/guest", AuthController.loginGuest);

export default router;
