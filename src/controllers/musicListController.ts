import { Request, Response } from "express";
import { db } from "../services/firebaseService";
import convertToEmbedUrl from "../utils/convertVideos";

type MusicLinkData = {
  id: string;
  name: string;
  link: string | null;
  letter: string | null;
  cifra: string | null;
  order: number;
};

export const getMusicLinks = async (req: Request, res: Response): Promise<void> => {
  try {
    // Referência para a coleção
    const musicLinksCollection = db.collection("musicLinks");

    // Busca todos os documentos ordenados pelo campo "order"
    const snapshot = await musicLinksCollection.orderBy("order", "asc").get();

    // Se não houver nenhum documento
    if (snapshot.empty) {
      res.status(200).json([]); // Retorna array vazio
      return;
    }

    // Monta o array com os dados e IDs
    const musicLinks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    }));

    res.status(200).json(musicLinks);

  } catch (error) {
    console.error("Erro ao buscar músicas:", error);
    res.status(500).json({ message: "Erro ao buscar músicas", error: String(error) });
  }
};

export const addMusicLink = async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, link, letter, cifra } = req.body;

    // Validação do campo obrigatório
    if (!name || typeof name !== 'string' || name.trim() === '') {
      res.status(400).json({ message: "O nome da música é obrigatório." });
      return;
    }

    const musicLinksCollection = db.collection("musicLinks");

    // Busca o último documento para saber o maior `order`
    const snapshot = await musicLinksCollection
      .orderBy("order", "desc")
      .limit(1)
      .get();

    const lastOrder = snapshot.empty ? 0 : snapshot.docs[0].data().order ?? 0;
    const newOrder = lastOrder + 1;

    console.log('Link adicionado com sucesso:', 'nome:', name, 'link', link, 'letra', letter, 'cifra', cifra);

    const embedLink = link ? convertToEmbedUrl(link) : null;

    // Cria um novo documento com ID automático
    const newDocRef = await musicLinksCollection.add({
      name: req.body.name,
      link: embedLink,
      letter: req.body.letter || null,
      cifra: req.body.cifra || null,
      order: newOrder,
    });

    res.status(201).json({ 
      id: newDocRef.id,
      message: "Música adicionada com sucesso!",
      order: newOrder
    });

  } catch (error) {
    console.error("Erro ao adicionar link de música:", error);
    res.status(500).json({ message: "Erro ao adicionar link de música", error: String(error) });
  }
};

export const updateMusicLink = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params; // ID do link a atualizar
    const { name, link, letter, cifra, order } = req.body;

    if (!id) {
      res.status(400).json({ message: "Id da musica obrigatório" });
      return;
    }

    if (!name) {
      res.status(400).json({ message: "Nome da musica obrigatório" });
      return;
    }

    const docRef = db.collection("musicLinks").doc(id);
    const docSnap = await docRef.get();

    if (!docSnap.exists) {
      res.status(404).json({ message: "Musica nao encontrada" });
      return;
    }

    const oldOrder = docSnap.data()?.order ?? 1;

    const embedLink = convertToEmbedUrl(link)

    // Atualiza o próprio documento
    await docRef.update({ name, link: embedLink, letter, cifra, order });

    // Se a ordem mudou, precisamos reorganizar os outros
    if (oldOrder !== order) {
      const snapshot = await db.collection("musicLinks").orderBy("order", "asc").get();

      const allDocs: MusicLinkData[] = snapshot.docs.map((d) => {
        const data = d.data() as Omit<MusicLinkData, "id">;
        return { id: d.id, ...data };
      });

      // Remove o item antigo da lista
      const filtered = allDocs.filter(item => item.id !== id);

      // Insere o item na nova posição
      filtered.splice(order - 1, 0, { id, name, link: embedLink, letter, cifra, order }); // insere na nova posição

      // Atualiza os `order` de todos com base na nova posição
      await Promise.all(
        filtered.map((item, index) =>
          db.collection("musicLinks").doc(item.id).update({ order: index + 1 })
        )
      );
    }

    res.status(200).json({ message: "Musica atualizada com sucesso" });

  } catch (error) {
    console.error("Erro ao atualizar musica:", error);
    res.status(500).json({ message: "Erro ao atualizar musica", error: String(error) });
  }
};

export const deleteMusicLink = async (req: Request, res: Response): Promise<void> => {
  try {
    const { id } = req.params; // ID do link a remover

    if (!id) {
      res.status(400).json({ message: "ID do link obrigatório" });
      return;
    }

    const docRef = db.collection("musicLinks").doc(id);
    await docRef.delete();

    // Após deletar, buscamos todos para reordenar
    const snapshot = await db.collection("musicLinks").orderBy("order", "asc").get();
    const docs = snapshot.docs;

    // Reordena os "order"
    await Promise.all(
      docs.map((docSnap, index) =>
        docSnap.ref.update({ order: index + 1 })
      )
    );

    res.status(200).json({ message: "Link de música removido com sucesso" });
    console.log("Link de musica " + id + " removido com sucesso");

  } catch (error) {
    console.error("Erro ao deletar link de música:", error);
    res.status(500).json({ message: "Erro ao deletar link de música", error: String(error) });
  }
};