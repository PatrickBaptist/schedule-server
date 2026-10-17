import { Router } from "express";
import { AuthController } from "../controllers/authController";
import { authenticateToken } from "../middlewares/authorizatizeToken";

const router = Router();

router.get("/me", AuthController.me);
router.post("/login", AuthController.login);
router.post("/google", AuthController.google);
router.post("/register", AuthController.register);
router.post("/verify-email", AuthController.verifyEmail);
router.post("/resend-verification", AuthController.resendEmailVerification);
router.get("/account/deletion-options", authenticateToken, AuthController.getAccountDeletionOptions);
router.delete("/account", authenticateToken, AuthController.deleteAccount);
router.post("/guest", AuthController.loginGuest);

export default router;
