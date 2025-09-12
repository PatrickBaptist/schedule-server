import { Request, Response } from "express";
import { admin, db } from "../repositories/firebaseService";

export const getNotification = async (req: Request, res: Response): Promise<void> => {
  try {
    const docRef = db.collection('notifications').doc('current');
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      res.status(404).json({ message: 'Notificação não encontrada' });
      return;
    }

    const data = docSnap.data();
    res.json(data);
  } catch (error) {
    console.error('Erro ao buscar notificação:', error);
    res.status(500).json({ message: 'Erro ao buscar notificação' });
  }
};

export const postNotification = async (req: Request, res: Response): Promise<void> => {
  try {
    const { text } = req.body;

    const firestoreTimestamp = admin.firestore.Timestamp.fromDate(new Date());

    await db.collection("notifications").doc("current").set({
      text: text.trim(),
      timestamp: firestoreTimestamp
    });

    res.status(201).json({ message: "Notificação salva com sucesso" });

  } catch (error) {
    console.error('Erro ao salvar notificação:', error);
    res.status(500).json({ message: 'Erro ao salvar notificação' });
  }
};

export const getWarnings = async (req: Request, res: Response) => {
  try {
    const docRef = db.collection("warnings").doc("current");
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      res.status(404).json({ message: "Aviso não encontrado" });
      return;
    }

    res.json(docSnap.data());
  } catch (error) {
    console.error("Erro ao buscar aviso:", error);
    res.status(500).json({ message: "Erro ao buscar aviso" });
  }
};

export const postWarnings = async (req: Request, res: Response) => {
   try {
    const { text } = req.body;

    const firestoreTimestamp = admin.firestore.Timestamp.fromDate(new Date());

    await db.collection("warnings").doc("current").set({
      text: text?.trim(),
      timestamp: firestoreTimestamp,
    });

    res.status(201).json({ message: "Aviso salvo com sucesso" });
  } catch (error) {
    console.error("Erro ao salvar aviso:", error);
    res.status(500).json({ message: "Erro ao salvar aviso" });
  }
};