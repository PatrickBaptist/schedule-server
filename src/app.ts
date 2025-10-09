import express from 'express';
import cors from 'cors';
import scheduleRoutes from './routes/scheduleRoutes';
import musicListRoutes from './routes/musicListRoutes';
import allMusicLinksRoutes from './routes/allMusicLinksRoutes';
import notificationRoutes from './routes/notificationRoutes';
import authUserRoutes from './routes/authUserRoutes';
import usersRouter from './routes/usersRoutes';

import { config } from 'dotenv';
import helmet from 'helmet';

config();

const port = process.env.PORT || 3000;
const app = express();

app.use(express.json());

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

app.use("/auth", authUserRoutes);
app.use("/users", usersRouter);

app.use("/schedule", scheduleRoutes);
app.use("/musicList", musicListRoutes);
app.use("/allMusicLinks", allMusicLinksRoutes);
app.use("/notification", notificationRoutes);

app.listen(port, () => {console.log(`Servidor rodando na porta ${port}`)});

export default app;