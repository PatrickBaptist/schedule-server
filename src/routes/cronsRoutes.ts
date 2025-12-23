import { Router } from 'express';
import { runBirthdayJob } from '../cron/birthdayCron';
import { runWeeklyVerseJob } from '../cron/sendVerseCron';
import { runWeeklyMusicJob } from '../cron/weeklyEmails';
import { clearAllMusicLinks } from '../utils/deleteMusicLinksCron';

const router = Router();

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

router.get("/delete-musics-weekly", async (req, res) => {
  try {
    await clearAllMusicLinks();
    res.status(200).send("crons delete MusicLinks executed");
  } catch (error) {
    console.error(error);
    res.status(500).send("Error executing delete MusicLinks");
  }
});

export default router;