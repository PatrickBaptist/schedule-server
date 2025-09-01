import { Request, Response } from "express";
import { db } from "../services/firebaseService";
import { clearMusicLinksIfChanged } from "../utils/clearMusicLinks";

interface SpecialSchedule {
  evento: string;
  data: string;
  vocal1: string;
  vocal2: string;
  teclas: string;
  violao: string;
  batera: string;
  bass: string;
  guita: string;
}

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
        sundays[existingIndex] = { date, músicos };
      } else {
        sundays.push({ date, músicos });
      }
    } else {
      sundays.push({ date, músicos });
    }

    await docRef.set({ sundays });
    res.status(200).json({ message: "Escala salva/atualizada com sucesso." });

  } catch (error) {
    console.error("Erro ao salvar escala:", error);
    res.status(500).json({ message: "Erro interno", error: String(error) });
  }
};

export const getSpecialSchedules = async (req: Request, res: Response): Promise<void> => {
  try {
    const snapshot = db.collection("specialSchedules").get()
      const schedules = (await snapshot).docs.map(doc =>  ({
          id: doc.id,
          ...doc.data(),
      }));
    res.status(200).json(schedules);
  } catch (err) {
    console.error("Erro ao buscar escala especial:", err);  
    res.status(500).json({ message: "Erro interno", error: String(err) });
  }
};

export const postSpecialSchedules = async (req: Request, res: Response): Promise<void> => {
  try {
    const { schedules } = req.body;
    if (!Array.isArray(schedules)) {
      res.status(400).json({ message: "Parâmetro 'schedules' inválido ou ausente." });
      return;
    }

    for (const s of schedules) {
      if (
        typeof s.evento !== "string" ||
        typeof s.data !== "string" ||
        typeof s.vocal1 !== "string" ||
        typeof s.vocal2 !== "string" ||
        typeof s.teclas !== "string" ||
        typeof s.violao !== "string" ||
        typeof s.batera !== "string" ||
        typeof s.bass !== "string" ||
        typeof s.guita !== "string"
      ) {
        res.status(400).json({ message: "Objeto 'SpecialSchedule' inválido." });
        return;
      }
    }

    for (const s of schedules) {
      await db.collection("specialSchedules").doc(s.data).set({
        ...s,
        timestamp: new Date().toISOString(),
      });
    }

    res.status(201).json({ message: "Escala especial salva com sucesso." });
  } catch (err) {
    console.error("Erro ao salvar escala especial:", err);
    res.status(500).json({ message: "Erro interno", error: String(err) });
  }
};

export const deleteSpecialSchedules = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const docRef = db.collection("specialSchedules").doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      res.status(404).json({ message: "Escala especial não encontrada." });
      return;
    }

    await docRef.delete();
    res.status(200).json({ message: "Escala especial deletada com sucesso." });
  } catch (err) {
    console.error("Erro ao deletar escala especial:", err);
    res.status(500).json({ message: "Erro interno", error: String(err) });
  }
};
