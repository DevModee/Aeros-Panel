import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import http from 'http';
import { initializeDatabase } from './database/db';
import { apiRouter } from './api';
import { setupWebSocket } from './websockets/logs';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

import path from 'path';

app.use('/api', apiRouter);

app.use(express.static(path.join(__dirname, '../../frontend/dist')));
app.use((req, res, next) => {
    if (!req.path.startsWith('/api')) {
        res.sendFile(path.join(__dirname, '../../frontend/dist/index.html'));
    } else {
        next();
    }
});

const server = http.createServer(app);
setupWebSocket(server);

async function startServer() {
    try {
        await initializeDatabase();
        
        server.listen(PORT, () => {
            console.log(`AerosPanel Backend listening on port ${PORT}`);
        });
    } catch (error) {
        console.error(error);
        process.exit(1);
    }
}

startServer();
