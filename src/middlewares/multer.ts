import multer from "multer";

// Armazena arquivos na memória temporariamente antes de enviar pro Firebase Storage
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
});
