import express from 'express';
import cors from 'cors';
import authUserRoutes from './routes/authUserRoutes';
import usersRouter from './routes/usersRoutes';
import cronsRoutes from './routes/cronsRoutes';
import { auditMiddleware } from './middlewares/auditMiddleware';
import { runDataRetentionCleanup } from './utils/dataRetentionCleanup';
import organizationRoutes, { invitationRoutes, ownershipTransferRoutes } from './routes/organizationRoutes';
import organizationDataRoutes from './routes/organizationDataRoutes';

import { config } from 'dotenv';
import helmet from 'helmet';

config();

const port = process.env.PORT || 3000;
const allowedOrigins = new Set(
    (process.env.VITE_API_URL_PRODUTION || '')
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean)
);
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
            if (!origin || allowedOrigins.has(origin)) {
                callback(null, true);
            } else {
                callback(new Error('Origem não permitida pelo CORS'));
            }
        }
    }
));

app.use("/cron", cronsRoutes);

app.use("/auth", authUserRoutes);
app.use("/organizations", organizationRoutes);
app.use("/organizations/:organizationId", organizationDataRoutes);
app.use("/invitations", invitationRoutes);
app.use("/ownership-transfers", ownershipTransferRoutes);
// Account profile is global; organization members are managed by scoped routes.
app.use("/users", usersRouter);

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
