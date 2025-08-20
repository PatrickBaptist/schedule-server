import { Request, Response } from "express";
import { db } from "../services/firebaseService";
import { clearMusicLinksIfChanged } from "../utils/clearMusicLinks";

export const getMonthlySchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const { month } = req.params;

    if (!month) {
      res.status(400).json({ message: "Mês obrigatório" });
      return;
    }

    const docRef = db.collection("schedules").doc(month);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      res.status(404).json({ message: "Escala não encontrada para esse mês." });
      return;
    }

    res.json(docSnap.data());
  } catch (err) {
    console.error("Erro ao buscar escala:", err);
    res.status(500).json({ message: "Erro ao buscar escala", error: String(err) });
  }
};

export const getNextSundaySchedule = async (req: Request, res: Response): Promise<void> => {
  try {
    const today = new Date();
    const day = today.getDay(); // 0 = domingo
    const daysUntilSunday = (7 - day) % 7;

    const nextSunday = new Date(today);
    nextSunday.setDate(today.getDate() + daysUntilSunday);
    nextSunday.setHours(0, 0, 0, 0);

    const formattedMonth = (nextSunday.getMonth() + 1).toString().padStart(2, "0");
    const year = nextSunday.getFullYear();
    const monthId = `${formattedMonth}-${year}`;

    const docRef = db.collection("schedules").doc(monthId);
    const snapshot = await docRef.get();

    if (!snapshot.exists) {
      res.status(404).json({ message: "Documento do mês não encontrado." });
      return;
    }

    const data = snapshot.data();
    const sundays = Array.isArray(data?.sundays) ? data.sundays : [];

    const nextSundayISO = nextSunday.toISOString().split('T')[0];

    // Chama a função que limpa musicLinks se a escala mudou
    const clearedMusicLinks = await clearMusicLinksIfChanged(nextSundayISO);

    const matchingSchedule = sundays.find((s: any) => {
      const sundayDate = new Date(s.date).toISOString().split('T')[0];
      return sundayDate === nextSundayISO;
    });

    if (!matchingSchedule) {
      res.status(404).json({ message: "Escala para o próximo domingo não encontrada." });
      return;
    }

    res.json({
      date: nextSundayISO,
      ...matchingSchedule.músicos,
      clearedMusicLinks,
    });

  } catch (err) {
    console.error("Erro ao buscar escala do próximo domingo:", err);
    res.status(500).json({ message: "Erro interno", error: String(err) });
  }
};

export const upsertSchedule = async (req: Request, res: Response): Promise<void> => {
  const { month, year, date, músicos } = req.body;

  if (!month || !year || !date || !músicos) {
    res.status(400).json({ message: "Parâmetros obrigatórios ausentes." });
    return;
  }

  const monthId = `${month}-${year}`;
  const docRef = db.collection("schedules").doc(monthId);

  const normalizedDate = new Date(date);
  normalizedDate.setUTCHours(3, 0, 0, 0);
  const isoDate = normalizedDate.toISOString();

  try {
    const docSnap = await docRef.get();
    let sundays = [];

    if (docSnap.exists) {
      const data = docSnap.data();
      sundays = data?.sundays || [];

      const toDateOnly = (d: string) => new Date(d).toISOString().slice(0, 10);
      const existingIndex = sundays.findIndex((s: any) => toDateOnly(s.date) === toDateOnly(date));

      if (existingIndex >= 0) {
        sundays[existingIndex] = { date, músicos }; // Atualiza a escala existente
      } else {
        sundays.push({ date, músicos }); // Adiciona uma nova escala
      }
    } else {
      sundays.push({ date, músicos }); // Cria nova lista se não existe
    }

    await docRef.set({ sundays });
    res.status(200).json({ message: "Escala salva/atualizada com sucesso." });

  } catch (error) {
    console.error("Erro ao salvar escala:", error);
    res.status(500).json({ message: "Erro interno", error: String(error) });
  }
};