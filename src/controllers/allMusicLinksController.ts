import { Request, Response } from "express";
import { db } from "../services/firebaseService";
import convertToEmbedUrl from "../utils/convertVideos";

export const getAllMusicLinks = async (req: Request, res: Response): Promise<void> => {
   try {
    const { page = "1", limit = "15", search = "" } = req.query;

    const pageNumber = parseInt(page as string, 10);
    const pageSize = parseInt(limit as string, 10);

    if (pageNumber < 1 || pageSize < 1) {
      res.status(400).json({ message: "Página e limite devem ser maiores que 0" });
      return;
    }

    let queryRef = db.collection("allMusicLinks").orderBy("createdAt", "desc");

    // Filtro de busca
    if (search) {
      const searchLower = (search as string).toLowerCase();
      queryRef = queryRef.where("nameLower", ">=", searchLower).where("nameLower", "<=", searchLower + "\uf8ff");
    }

    // Paginação
    const snapshot = await queryRef.offset((pageNumber - 1) * pageSize).limit(pageSize).get();

    const musicLinks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json({
      page: pageNumber,
      limit: pageSize,
      results: musicLinks,
      total: musicLinks.length,
    });

  } catch (error) {
    console.error("Erro ao buscar histórico de músicas:", error);
    res.status(500).json({ message: "Erro ao buscar histórico de músicas", error: String(error) });
  }
};

export const addAllMusicLink = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, link, letter, cifra } = req.body;

    // Validação do campo obrigatório
    if (!name || typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ message: "O nome da música é obrigatório." });
      return;
    }

    const embedLink = link ? convertToEmbedUrl(link) : null;

    // Cria um novo documento com ID automático
    const newDocRef = await db.collection("allMusicLinks").add({
      name: name.trim(),
      nameLower: name.trim().toLowerCase(), // para busca
      link: embedLink,
      letter: letter || null,
      cifra: cifra || null,
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
    const { id } = req.params; // ID do link a atualizar
    const { name, link, letter, cifra } = req.body;

    if (!id) {
      res.status(400).json({ message: "Id da musica obrigatório" });
      return;
    }

    if (!name) {
      res.status(400).json({ message: "Nome da musica obrigatório" });
      return;
    }

    const docRef = db.collection("allMusicLinks").doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      res.status(404).json({ message: "Musica nao encontrada" });
      return;
    }

    const embedLink = convertToEmbedUrl(link)

    // Atualiza o próprio documento
    await docRef.update({
      name: name.trim(),
      nameLower: name.trim().toLowerCase(), // para search
      link: embedLink,
      letter: letter || null,
      cifra: cifra || null,
    });

    res.status(200).json({ message: "Música do histórico atualizada com sucesso!" });

  } catch (error) {
    console.error("Erro ao atualizar música no histórico:", error);
    res.status(500).json({ message: "Erro ao atualizar música no histórico", error: String(error) });
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
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      res.status(404).json({ message: "Música não encontrada no histórico" });
      return;
    }

    await docRef.delete();

    res.status(200).json({ message: "Link de música removido com sucesso" });
    console.log("Link de musica " + id + " removido com sucesso");

  } catch (error) {
    console.error("Erro ao deletar música do histórico:", error);
    res.status(500).json({ message: "Erro ao deletar música do histórico:", error: String(error) });
  }
};