import express from 'express';
import cors from 'cors';
import scheduleRoutes from './routes/scheduleRoutes';
import musicListRoutes from './routes/musicListRoutes';
import allMusicLinksRoutes from './routes/allMusicLinksRoutes';
import notificationRoutes from './routes/notificationRoutes';
import authUserRoutes from './routes/authUserRoutes';
import usersRouter from './routes/usersRoutes';
import cronsRoutes from './routes/cronsRoutes';
import auditRoutes from './routes/auditRoutes';
import { auditMiddleware } from './middlewares/auditMiddleware';
import { runDataRetentionCleanup } from './utils/dataRetentionCleanup';

import { config } from 'dotenv';
import helmet from 'helmet';

config();

const port = process.env.PORT || 3000;
const app = express();
const DATA_RETENTION_INTERVAL_MS = 24 * 60 * 60 * 1000;

function cleanExpiredData(): void {
    void runDataRetentionCleanup().catch((error) => {
        console.error('Erro ao executar limpeza de dados antigos:', error);
    });
}

app.use(express.json());
app.use(auditMiddleware);

app.use(helmet({
    crossOriginResourcePolicy: false
}));

app.use(cors(
    {
        origin: (origin, callback) => {
            if (!origin || [
                'https://ibmmlouvor.com.br',
                'http://localhost:5173'
            ].includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error('Origem não permitida pelo CORS'));
            }
        }
    }
));

app.use("/cron", cronsRoutes);

app.use("/auth", authUserRoutes);
app.use("/users", usersRouter);
app.use("/audit", auditRoutes);

app.use("/schedule", scheduleRoutes);
app.use("/musicList", musicListRoutes);
app.use("/allMusicLinks", allMusicLinksRoutes);
app.use("/notification", notificationRoutes);

app.get('/ping', (req, res) => {
    res.status(200).json({ message: 'Sistema funcionando' })
});

app.listen(port, () => {
    console.log(`Servidor rodando na porta ${port}`);
    cleanExpiredData();

    const retentionInterval = setInterval(cleanExpiredData, DATA_RETENTION_INTERVAL_MS);
    retentionInterval.unref();
});

export default app;
