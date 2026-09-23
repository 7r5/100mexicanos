import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import pg from 'pg';
import { createServer } from 'node:http';
import { Server } from 'socket.io';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const port = Number(process.env.PORT || 10000);
const hostToken = process.env.HOST_TOKEN || crypto.randomBytes(18).toString('hex');
const allowedOrigin = process.env.FRONTEND_URL || '*';
const pool = process.env.DATABASE_URL
    ? new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } })
    : null;

const initialState = () => ({
    version: 1,
    scores: { red: 0, white: 0 },
    currentCard: null,
    usedCards: [],
    skippedCards: [],
    wrongAnswers: 0,
    status: 'waiting',
    updatedAt: new Date().toISOString()
});

let state = initialState();
let cards = [];

function createPoints() {
    const top = 44 + Math.floor(Math.random() * 7);
    const gaps = Array.from({ length: 5 }, () => 3 + Math.floor(Math.random() * 4));
    const values = [top];
    for (const gap of gaps) values.push(values.at(-1) - gap);
    const minimum = values.at(-1);
    if (minimum < 20) return createPoints();
    return values;
}

function parseCsvLine(line) {
    const values = [];
    let value = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
        const character = line[index];
        if (character === '"') {
            if (quoted && line[index + 1] === '"') {
                value += '"';
                index += 1;
            } else {
                quoted = !quoted;
            }
        } else if (character === ',' && !quoted) {
            values.push(value.trim());
            value = '';
        } else {
            value += character;
        }
    }
    values.push(value.trim());
    return values;
}

async function loadCards() {
    const csv = await fs.readFile(path.join(rootDir, 'data.csv'), 'utf8');
    const lines = csv.split(/\r?\n/).filter(Boolean);
    const headers = parseCsvLine(lines.shift());
    return lines.map((line, index) => {
        const values = parseCsvLine(line);
        return {
            id: `card-${index + 1}`,
            question: values[0],
            answers: headers.slice(1, 7).map((_, answerIndex) => values[answerIndex + 1]).filter(Boolean)
        };
    }).filter((card) => card.question && card.answers.length === 6);
}

async function ensureDatabase() {
    if (!pool) return;
    await pool.query(`
    CREATE TABLE IF NOT EXISTS game_state (
      id integer PRIMARY KEY,
      state jsonb NOT NULL,
      updated_at timestamptz NOT NULL DEFAULT now()
    )
  `);
    const result = await pool.query('SELECT state FROM game_state WHERE id = 1');
    if (result.rows[0]?.state) state = result.rows[0].state;
    else await saveState();
}

async function loadLocalBackup() {
    if (pool) return;
    const backupPath = path.join(__dirname, 'data', 'game-state.json');
    try {
        state = JSON.parse(await fs.readFile(backupPath, 'utf8'));
    } catch {
        await saveState();
    }
}

async function saveState() {
    state.updatedAt = new Date().toISOString();
    if (pool) {
        await pool.query(
            `INSERT INTO game_state (id, state, updated_at) VALUES (1, $1::jsonb, now())
       ON CONFLICT (id) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
            [JSON.stringify(state)]
        );
        return;
    }
    const backupDir = path.join(__dirname, 'data');
    const backupPath = path.join(backupDir, 'game-state.json');
    const temporaryPath = `${backupPath}.tmp`;
    await fs.mkdir(backupDir, { recursive: true });
    await fs.writeFile(temporaryPath, JSON.stringify(state, null, 2));
    await fs.rename(temporaryPath, backupPath);
}

function publicState() {
    return state;
}

function getCard(cardId) {
    return cards.find((card) => card.id === cardId);
}

function chooseCard() {
    const unavailable = new Set([...state.usedCards, ...state.skippedCards]);
    const available = cards.filter((card) => !unavailable.has(card.id));
    if (!available.length) return null;
    const card = available[Math.floor(Math.random() * available.length)];
    state.currentCard = {
        ...card,
        points: createPoints(),
        revealed: Array(6).fill(null),
        wrongAnswers: 0
    };
    state.status = 'playing';
    state.wrongAnswers = 0;
    return state.currentCard;
}

function requireHost(socket, next) {
    if (socket.handshake.auth?.token !== hostToken) return next(new Error('Host token invalido'));
    socket.data.isHost = true;
    next();
}

function resetScores() {
    state.scores = { red: 0, white: 0 };
}

const app = express();
app.use(cors({ origin: allowedOrigin === '*' ? true : allowedOrigin }));
app.use(express.json());
app.get('/api/health', (_request, response) => response.json({ ok: true }));
app.get('/api/state', (_request, response) => response.json(publicState()));
app.get('/api/session', (_request, response) => response.json({ hostToken }));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: allowedOrigin === '*' ? true : allowedOrigin } });
const hostNamespace = io.of('/host');
hostNamespace.use(requireHost);

io.on('connection', (socket) => {
    socket.emit('state:update', publicState());
});
hostNamespace.on('connection', (socket) => {
    socket.emit('state:update', publicState());
    socket.on('game:new-card', async (ack = () => { }) => {
        try {
            if (state.currentCard?.id) state.usedCards.push(state.currentCard.id);
            if (!chooseCard()) throw new Error('No quedan tarjetas disponibles');
            await saveState();
            io.emit('state:update', publicState());
            ack({ ok: true });
        } catch (error) { ack({ ok: false, error: error.message }); }
    });
    socket.on('game:skip-card', async (ack = () => { }) => {
        try {
            if (!state.currentCard) throw new Error('No hay tarjeta activa');
            state.skippedCards.push(state.currentCard.id);
            state.currentCard = null;
            state.status = 'waiting';
            await saveState();
            io.emit('state:update', publicState());
            ack({ ok: true });
        } catch (error) { ack({ ok: false, error: error.message }); }
    });
    socket.on('game:reveal', async ({ answerIndex, team }, ack = () => { }) => {
        try {
            if (!state.currentCard || !['red', 'white'].includes(team)) throw new Error('Accion invalida');
            if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 5) throw new Error('Respuesta invalida');
            if (state.currentCard.revealed[answerIndex]) throw new Error('Respuesta ya revelada');
            const points = state.currentCard.points[answerIndex];
            state.currentCard.revealed[answerIndex] = { team, points };
            state.scores[team] += points;
            await saveState();
            io.emit('state:update', publicState());
            ack({ ok: true });
        } catch (error) { ack({ ok: false, error: error.message }); }
    });
    socket.on('game:strike', async (ack = () => { }) => {
        try {
            if (!state.currentCard) throw new Error('No hay tarjeta activa');
            state.wrongAnswers = Math.min(3, state.wrongAnswers + 1);
            await saveState();
            io.emit('state:update', publicState());
            ack({ ok: true });
        } catch (error) { ack({ ok: false, error: error.message }); }
    });
    socket.on('game:set-scores', async ({ red, white }, ack = () => { }) => {
        try {
            const nextScores = { red: Number(red), white: Number(white) };
            if (!Number.isInteger(nextScores.red) || !Number.isInteger(nextScores.white) || nextScores.red < 0 || nextScores.white < 0) throw new Error('Puntuacion invalida');
            state.scores = nextScores;
            await saveState();
            io.emit('state:update', publicState());
            ack({ ok: true });
        } catch (error) { ack({ ok: false, error: error.message }); }
    });
    socket.on('game:reset-scores', async (ack = () => { }) => {
        try { resetScores(); await saveState(); io.emit('state:update', publicState()); ack({ ok: true }); }
        catch (error) { ack({ ok: false, error: error.message }); }
    });
    socket.on('game:hard-reset', async (ack = () => { }) => {
        try { state = initialState(); await saveState(); io.emit('state:update', publicState()); ack({ ok: true }); }
        catch (error) { ack({ ok: false, error: error.message }); }
    });
});

cards = await loadCards();
await ensureDatabase();
await loadLocalBackup();
httpServer.listen(port, '0.0.0.0', () => console.log(`Backend listo en el puerto ${port}`));
