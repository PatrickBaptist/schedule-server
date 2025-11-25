import fetch from "node-fetch";
import translate from "translate";

translate.engine = "google";
translate.key = undefined;

interface OurMannaResponse {
  verse: {
    details: {
      text: string;
      reference: string;
      version: string;
      verseurl: string;
    };
    notice: string;
  };
}

export class VerseService {
  private API_URL = "https://beta.ourmanna.com/api/v1/get/?format=json";

  async getVerseOfTheDay(): Promise<string> {
    try {
      const res = await fetch(this.API_URL);
      const data = (await res.json()) as OurMannaResponse;
      const verseEN = data.verse.details.text;
      const refEN = data.verse.details.reference;

      const versePT = await translate(verseEN, { to: "pt" });
      const refPT = await translate(refEN, { to: "pt" });

      return {
        verse: versePT,
        reference: refPT,
      };
    } catch (error) {
      console.error("Erro ao buscar ou traduzir o versículo:", error);
      return {
          verse: "Que Deus abençoe seu dia!",
          reference: "",
        };
    }
  }
}
