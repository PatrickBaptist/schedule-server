import { Request, Response } from "express";
import { db } from "../services/firebaseService";
import convertToEmbedUrl from "../utils/convertVideos";
import { remove as removeAccents } from "diacritics";

interface MusicLink {
  name: string;
  link?: string | null;
  letter?: string | null;
  cifra?: string | null;
  minister?: string | null;
  createdAt?: Date;
  nameSearch?: string[];
}

const normalizeName = (name: string) =>
  removeAccents(name.toLowerCase()).replace(/[^a-z0-9\s]/g, "");

function normalizeString(str: string) {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/gi, "")
    .toLowerCase()
    .trim();
}

export const getAllMusicLinks = async (req: Request, res: Response): Promise<void> => {
  try {
    const { page = "1", limit = "10", search = "" } = req.query;

    const pageNumber = Number(page);
    const pageSize = Number(limit);

    if (pageNumber < 1 || pageSize < 1) {
      res.status(400).json({ message: "Página e limite devem ser maiores que 0" });
      return;
    }

    let queryRef = db.collection("allMusicLinks").orderBy("createdAt", "desc");

    // Busca insensível a acentos e pontuação
    if (search) {
      const normalizedSearch = normalizeString(search as string);
      const searchWords = normalizedSearch.split(" ").filter(word => word !== "");

      // Firestore só permite 1 filtro array-contains, então pegamos a primeira palavra
      if (searchWords.length > 0) {
        queryRef = queryRef.where("nameSearch", "array-contains", searchWords[0]);
      }
    }

    const snapshot = await queryRef.offset((pageNumber - 1) * pageSize).limit(pageSize + 1).get();

    const musicLinks: MusicLink[] = snapshot.docs.slice(0, pageSize).map(doc => {
      const data = doc.data() as MusicLink;
      return { id: doc.id, ...data };
    });

    const hasNextPage = snapshot.docs.length > pageSize;
    const hasPrevPage = pageNumber > 1;

    res.status(200).json({
      page: pageNumber,
      limit: pageSize,
      results: musicLinks,
      hasNextPage,
      hasPrevPage,
    });
  } catch (error) {
    console.error("Erro ao buscar histórico de músicas:", error);
    res.status(500).json({ message: "Erro ao buscar histórico de músicas", error: String(error) });
  }
};

export const addAllMusicLink = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, link, letter, cifra, minister } = req.body;

    // Validação do campo obrigatório
    if (!name || typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ message: "O nome da música é obrigatório." });
      return;
    }

    const embedLink = link ? convertToEmbedUrl(link) : null;
    const nameWords  = normalizeName(name.trim());
    const normalizedName = nameWords.split(" ");

    // Cria um novo documento com ID automático
    const newDocRef = await db.collection("allMusicLinks").add({
      name: name.trim(),
      nameSearch: normalizedName,
      link: embedLink,
      letter: letter || null,
      cifra: cifra || null,
      minister: minister || null,
      createdAt: new Date(),
    });

    console.log('Link adicionado com sucesso:', 'nome:', name, 'link', link, 'letra', letter, 'cifra', cifra);

    res.status(201).json({
      id: newDocRef.id,
      message: "Música adicionada ao histórico com sucesso!",
    });

  } catch (error) {
    console.error("Erro ao adicionar música no histórico:", error);
    res.status(500).json({ message: "Erro ao adicionar música no histórico", error: String(error) });
  }
};

export const updateAllMusicLink = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, link, letter, cifra, minister } = req.body;

    if (!id) {
      res.status(400).json({ message: "Id da musica obrigatório" });
      return;
    }

    if (!name) {
      res.status(400).json({ message: "Nome da musica obrigatório" });
      return;
    }

    if (!minister) {
      res.status(400).json({ message: "Ministro obrigatório" });
      return;
    }

    const docRef = db.collection("allMusicLinks").doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      res.status(404).json({ message: "Musica nao encontrada" });
      return;
    }

    const embedLink = convertToEmbedUrl(link)
    const nameWords  = normalizeName(name.trim());
    const normalizedName = nameWords.split(" ");

    await docRef.set(
      { 
        name,
        nameSearch: normalizedName,
        link: embedLink,
        letter,
        cifra,
        minister
      },
      { merge: true }
    );

    res.status(200).json({ message: "Musica atualizada com sucesso" });

  } catch (error) {
    console.error("Erro ao atualizar musica:", error);
    res.status(500).json({ message: "Erro ao atualizar musica", error: String(error) });
  }
};

export const deleteAllMusicLink = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    if (!id) {
      res.status(400).json({ message: "ID do link obrigatório" });
      return;
    }

    const docRef = db.collection("allMusicLinks").doc(id);
    await docRef.delete();

    res.status(200).json({ message: "Link de música removido com sucesso" });
    console.log("Link de musica " + id + " removido com sucesso");

  } catch (error) {
    console.error("Erro ao deletar link de música:", error);
    res.status(500).json({ message: "Erro ao deletar link de música", error: String(error) });
  }
};