import { db } from "../repositories/firebaseService";

export type MusicLinkData = {
  id: string;
  name: string;
  worshipMoment?: string;
  link?: string | null;
  letter?: string | null;
  spotify?: string | null;
  cifra?: string | null;
  description?: string | null;
  minister?: string | null;
  order: number;
  createdBy?: string;
};

export class MusicService {
  private collection;

  constructor() {
    this.collection = db.collection("musicLinks");
  }

  async fetchWeeklyMusicLinks(): Promise<MusicLinkData[]> {
    const snapshot = await this.collection.orderBy("order", "asc").get();

    if (snapshot.empty) return [];

    const musicLinks = snapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
    })) as MusicLinkData[];

    return musicLinks;
  }
}