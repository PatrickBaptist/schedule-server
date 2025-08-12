import { Request, Response, NextFunction } from 'express';

export const validateSchedule = (req: Request, res: Response, next: NextFunction) => {
  const { name, date, shift } = req.body;

  if (!name || !date || !shift) {
    return res.status(400).json({ error: 'Campos obrigatórios ausentes' });
  }

  // Validações adicionais podem ser adicionadas aqui

  next();
};
