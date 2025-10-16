import { Request, Response } from "express";
import { db } from "../repositories/firebaseService";
import convertToEmbedUrl from "../utils/convertVideos";
import { remove as removeAccents } from "diacritics";
import { UserRole } from "../enums/UserRoles";
import jwt from "jsonwebtoken";

type MusicLinkData = {
  id: string;
  name: string;
  link: string | null;
  letter: string | null;
  cifra: string | null;
  minister?: string | null;
  order: number;
};

const normalizeName = (name: string) =>
  removeAccents(name.toLowerCase()).replace(/[^a-z0-9\s]/g, "");

function normalizeString(str: string) {
  return str
    .normalize("NFD") // separa os acentos
    .replace(/[\u0300-\u036f]/g, "") // remove acentos
    .replace(/[^\w\s]/gi, "") // remove pontuação
    .toLowerCase();
}

export const getMusicLinks = async (req: Request, res: Response): Promise<void> => {
  try {
    const musicLinksCollection = db.collection("musicLinks");

    const snapshot = await musicLinksCollection.orderBy("order", "asc").get();

    if (snapshot.empty) {
      res.status(200).json([]); // Retorna array vazio
      return;
    }

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
    const { name, link, letter, spotify, cifra } = req.body;

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ message: "Token não fornecido" });
      return;
    }

    const token = authHeader.split(" ")[1];

    let decoded: any;

    try {
      decoded = jwt.verify(token, process.env.JWT_SECRET as string);
    } catch (err) {
      res.status(403).json({ message: "Token inválido" });
      return;
    }

    const userId = decoded.userId;

    const userDoc = await db.collection("users").doc(userId).get();
    if (!userDoc.exists) {
      res.status(404).json({ message: "Usuário não encontrado" });
      return;
    }

    const userData = userDoc.data();
    if (!userData) {
      res.status(400).json({ message: "Dados do usuário não encontrados" });
      return;
    }

    const allowedRoles = [UserRole.Minister];
    let assignedMinister: string | null = null;

     if (userData?.roles && userData.roles.some((role: string) => allowedRoles.includes(role as UserRole))) {
      assignedMinister = userData.nickname || userData.name;
    } else if (req.body.ministeredBy){
      assignedMinister = req.body.ministeredBy;
    } else {
      res.status(403).json({ message: "Informe quem ministrou a música" });
      return;
    }

    if (!name || typeof name !== "string" || name.trim() === "") {
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

    console.log('Link adicionado com sucesso:', 'nome:', name, 'link', link, 'letra', letter, 'spotify', spotify,'cifra', cifra);

    const embedLink = link ? convertToEmbedUrl(link) : null;

    let newDocRef;
    if (req.body.id) {
      newDocRef = musicLinksCollection.doc(req.body.id);
      await newDocRef.set({
        name: req.body.name,
        link: embedLink,
        letter: req.body.letter || null,
        spotify: req.body.spotify || null,
        cifra: req.body.cifra || null,
        minister: assignedMinister || null,
        order: newOrder,
        createdBy: userId
      }, { merge: true });
    } else {
      newDocRef = await musicLinksCollection.add({
        name: req.body.name,
        link: embedLink,
        letter: req.body.letter || null,
        spotify: req.body.spotify || null,
        cifra: req.body.cifra || null,
        minister: assignedMinister || null,
        order: newOrder,
        createdBy: userId
      });
    }

    const newId = newDocRef.id;

    const nameWords  = normalizeName(name.trim());
    const normalizedName = nameWords.split(" ");

    let existingHistorySnap;

    if (embedLink) {
      existingHistorySnap = await db.collection("allMusicLinks")
        .where("link", "==", embedLink)
        .where("minister", "==", assignedMinister)
        .limit(1)
        .get();
    } else {
      existingHistorySnap = await db.collection("allMusicLinks")
        .where("name", "==", name.trim())
        .where("minister", "==", assignedMinister)
        .limit(1)
        .get();
    }

    // Cria um registro no histórico
    if (existingHistorySnap.empty) {
      await db.collection("allMusicLinks").doc(newId).set({
        name,
        nameSearch: normalizedName,
        link: embedLink,
        letter: letter || null,
        spotify: spotify || null,
        cifra: cifra || null,
        createdAt: new Date(),
        minister: assignedMinister,
        createdBy: userId,
      }, { merge: true });
    }

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
    const { id } = req.params;
    const { name, link, letter, spotify, cifra, order, ministeredBy } = req.body;

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

    const oldData = docSnap.data();
    const oldOrder = docSnap.data()?.order ?? 1;

    const embedLink = convertToEmbedUrl(link)

    // Garante que o minister não seja perdido
    const finalMinister = ministeredBy || oldData?.minister || null;

    // Atualiza o próprio documento
    await docRef.update({ name, link: embedLink, letter, spotify, cifra, order, minister: finalMinister });

    // Atualiza também allMusicLinks com o mesmo ID
    const nameWords  = normalizeName(name.trim());
    const normalizedName = nameWords.split(" ");
    await db.collection("allMusicLinks").doc(id).set(
      { name, 
        nameSearch: normalizedName, 
        link: embedLink,
        letter,
        spotify,
        cifra,
        minister: finalMinister || null
      },
      { merge: true } // merge = não sobrescreve tudo, só atualiza os campos enviados
    );

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