import { NextFunction, Request, Response, Router } from 'express';
import { runBirthdayJob } from '../cron/birthdayCron';
import { runWeeklyVerseJob } from '../cron/sendVerseCron';
import { runWeeklyMusicJob } from '../cron/weeklyEmails';

const router = Router();

function authorizeCron(req: Request, res: Response, next: NextFunction): void {
  const configuredSecret = process.env.CRON_SECRET;
  const providedSecret = req.get("x-cron-secret");

  if (!configuredSecret) {
    console.error("CRON_SECRET nao foi configurado no servidor.");
    res.status(503).send("Cron configuration unavailable");
    return;
  }

  if (providedSecret !== configuredSecret) {
    res.status(401).send("Unauthorized cron request");
    return;
  }

  next();
}

router.use(authorizeCron);

router.get("/birthday", async (req, res) => {
  try {
    await runBirthdayJob();
    res.status(200).send("Birthday cron executed");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error executing birthday cron");
  }
});

router.get("/verse", async (req, res) => {
  try {
    await runWeeklyVerseJob();
    res.status(200).send("Verse cron executed");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error executing verse cron");
  }
});

router.get("/music", async (req, res) => {
  try {
    await runWeeklyMusicJob();
    res.status(200).send("Music cron executed");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error executing music cron");
  }
});

export default router;
