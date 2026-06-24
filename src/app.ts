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

import { config } from 'dotenv';
import helmet from 'helmet';

// 1. Carrega as variáveis de ambiente primeiro
config();

// 2. Inicializa a constante 'app' antes de usá-la nos middlewares (Resolve o erro do nome 'app')
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(auditMiddleware);

app.use(helmet({
    crossOriginResourcePolicy: false
}));

// 3. Configuração do CORS com tipagem explícita (Resolve o erro do implicitamente 'any')
app.use(cors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
        const allowedOrigins = [
            'https://ibmmlouvor.com.br',
            'https://bookish-broccoli-wvpv454jq9g297pw-5173.app.github.dev',
            'https://upgraded-yodel-r7q7x6xvvj52p46p-5173.app.github.dev',
            'http://localhost:5173',
            'http://localhost:3000'
        ];

        if (!origin || allowedOrigins.includes(origin) || origin.endsWith('.github.dev')) {
            callback(null, true);
        } else {
            callback(new Error(`Origem não permitida pelo CORS: ${origin}`));
        }
    },
    credentials: true
}));

// 4. Definição das Rotas
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
});

export default app;