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
    teamNames: { red: 'ROJO', white: 'BLANCO' },
    strikes: { red: 0, white: 0 },
    lastStrikeTeam: null,
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

function normalizeState() {
    state.teamNames ??= { red: 'ROJO', white: 'BLANCO' };
    state.strikes ??= { red: 0, white: 0 };
    return state;
}

function publicState() {
    return normalizeState();
}

function stateForViewer(isHost) {
    normalizeState();
    if (isHost || !state.currentCard || state.currentCard.questionVisible) return state;
    return {
        ...state,
        currentCard: {
            ...state.currentCard,
            question: '',
            answers: state.currentCard.answers.map((answer, index) =>
                state.currentCard.revealed?.[index] ? answer : ''
            )
        }
    };
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
        roundPoints: 0,
        awardedTo: null,
        questionVisible: false,
        wrongAnswers: 0,
        stolenBy: null
    };
    state.strikes = { red: 0, white: 0 };
    state.lastStrikeTeam = null;
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
app.get('/api/state', (_request, response) => response.json(stateForViewer(false)));
app.get('/api/session', (_request, response) => response.json({ hostToken }));

const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: allowedOrigin === '*' ? true : allowedOrigin } });
const hostNamespace = io.of('/host');
hostNamespace.use(requireHost);
const sendCurrentState = (socket, ack) => {
    socket.emit('state:update', stateForViewer(Boolean(socket.data.isHost)));
    if (typeof ack === 'function') ack({ ok: true });
};
const broadcastState = () => {
    io.emit('state:update', stateForViewer(false));
    hostNamespace.emit('state:update', stateForViewer(true));
};

io.on('connection', (socket) => {
    sendCurrentState(socket);
    socket.on('state:request', (_payload, ack) => sendCurrentState(socket, ack));
});
hostNamespace.on('connection', (socket) => {
    sendCurrentState(socket);
    socket.on('state:request', (_payload, ack) => sendCurrentState(socket, ack));
    const reply = (ack, result) => {
        if (typeof ack === 'function') ack(result);
    };
    socket.on('game:new-card', async (_payload, ack) => {
        try {
            if (state.currentCard?.id) state.usedCards.push(state.currentCard.id);
            if (!chooseCard()) throw new Error('No quedan tarjetas disponibles');
            await saveState();
            broadcastState();
            reply(ack, { ok: true });
        } catch (error) { reply(ack, { ok: false, error: error.message }); }
    });
    socket.on('game:reveal-question', async (_payload, ack) => {
        try {
            if (!state.currentCard) throw new Error('No hay tarjeta activa');
            state.currentCard.questionVisible = true;
            await saveState();
            broadcastState();
            reply(ack, { ok: true });
        } catch (error) { reply(ack, { ok: false, error: error.message }); }
    });
    socket.on('game:skip-card', async (_payload, ack) => {
        try {
            if (!state.currentCard) throw new Error('No hay tarjeta activa');
            state.skippedCards.push(state.currentCard.id);
            state.currentCard = null;
            state.strikes = { red: 0, white: 0 };
            state.lastStrikeTeam = null;
            state.status = 'waiting';
            await saveState();
            broadcastState();
            reply(ack, { ok: true });
        } catch (error) { reply(ack, { ok: false, error: error.message }); }
    });
    socket.on('game:reveal', async ({ answerIndex }, ack) => {
        try {
            if (!state.currentCard) throw new Error('Accion invalida');
            if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex > 5) throw new Error('Respuesta invalida');
            if (state.currentCard.revealed[answerIndex]) throw new Error('Respuesta ya revelada');
            const points = Number(state.currentCard.points[answerIndex]);
            if (!Number.isFinite(points)) throw new Error('Puntuacion invalida');
            const alreadyAwarded = Boolean(state.currentCard.awardedTo);
            if (alreadyAwarded) {
                state.currentCard.revealed[answerIndex] = { points, displayOnly: true };
            } else {
                state.currentCard.revealed[answerIndex] = { points };
                state.currentCard.roundPoints = Number(state.currentCard.roundPoints || 0) + points;
            }
            await saveState();
            broadcastState();
            reply(ack, { ok: true, scored: !alreadyAwarded });
        } catch (error) { reply(ack, { ok: false, error: error.message }); }
    });
    socket.on('game:end-game', async (_payload, ack) => {
        try {
            state.status = 'finished';
            await saveState();
            broadcastState();
            reply(ack, { ok: true });
        } catch (error) { reply(ack, { ok: false, error: error.message }); }
    });
    socket.on('game:award-round', async ({ team }, ack) => {
        try {
            if (!state.currentCard || !['red', 'white'].includes(team)) throw new Error('Equipo invalido');
            if (state.currentCard.awardedTo) throw new Error('La ronda ya fue asignada');
            state.strikes ??= { red: 0, white: 0 };
            if (state.strikes[team] >= 3) throw new Error('El equipo con tres equis no puede recibir la ronda');
            const roundPoints = Number(state.currentCard.roundPoints || 0);
            state.scores[team] = Number(state.scores[team]) + roundPoints;
            state.currentCard.awardedTo = team;
            state.currentCard.revealed = state.currentCard.revealed.map((answer) => (answer ? { ...answer, team } : answer));
            await saveState();
            broadcastState();
            reply(ack, { ok: true, points: roundPoints });
        } catch (error) { reply(ack, { ok: false, error: error.message }); }
    });
    socket.on('game:strike', async ({ team }, ack) => {
        try {
            if (!state.currentCard || !['red', 'white'].includes(team)) throw new Error('Equipo invalido');
            state.strikes ??= { red: 0, white: 0 };
            state.strikes[team] = Math.min(3, state.strikes[team] + 1);
            state.lastStrikeTeam = team;
            await saveState();
            broadcastState();
            reply(ack, { ok: true });
        } catch (error) { reply(ack, { ok: false, error: error.message }); }
    });
    socket.on('game:steal', async ({ fromTeam, toTeam }, ack) => {
        try {
            if (!state.currentCard || !['red', 'white'].includes(fromTeam) || !['red', 'white'].includes(toTeam) || fromTeam === toTeam) throw new Error('Robo invalido');
            state.strikes ??= { red: 0, white: 0 };
            if (state.strikes[fromTeam] < 3) throw new Error('El equipo aun no tiene tres equis');
            if (state.currentCard.awardedTo) throw new Error('La ronda ya fue asignada');
            const roundPoints = Number(state.currentCard.roundPoints || 0);
            state.scores[toTeam] = Number(state.scores[toTeam]) + roundPoints;
            state.currentCard.awardedTo = toTeam;
            state.currentCard.stolenBy = toTeam;
            state.currentCard.revealed = state.currentCard.revealed.map((answer) => (answer ? { ...answer, team: toTeam } : answer));
            await saveState();
            broadcastState();
            reply(ack, { ok: true, points: roundPoints });
        } catch (error) { reply(ack, { ok: false, error: error.message }); }
    });
    socket.on('game:set-scores', async ({ red, white }, ack) => {
        try {
            const nextScores = { red: Math.trunc(Number(red)), white: Math.trunc(Number(white)) };
            if (!Number.isInteger(nextScores.red) || !Number.isInteger(nextScores.white) || nextScores.red < 0 || nextScores.white < 0) throw new Error('Puntuacion invalida');
            state.scores = nextScores;
            await saveState();
            broadcastState();
            reply(ack, { ok: true });
        } catch (error) { reply(ack, { ok: false, error: error.message }); }
    });
    socket.on('game:set-team-names', async ({ red, white }, ack) => {
        try {
            const teamNames = {
                red: String(red || '').trim().slice(0, 24),
                white: String(white || '').trim().slice(0, 24)
            };
            if (!teamNames.red || !teamNames.white) throw new Error('Los dos equipos necesitan nombre');
            state.teamNames = teamNames;
            await saveState();
            broadcastState();
            reply(ack, { ok: true });
        } catch (error) { reply(ack, { ok: false, error: error.message }); }
    });
    socket.on('game:play-sound', async ({ soundKey }, ack) => {
        try {
            const key = String(soundKey || '').trim();
            if (!key) throw new Error('Sonido invalido');
            io.emit('sound:play', { soundKey: key });
            reply(ack, { ok: true });
        } catch (error) { reply(ack, { ok: false, error: error.message }); }
    });
    socket.on('game:stop-sound', async (_payload, ack) => {
        try {
            io.emit('sound:stop');
            reply(ack, { ok: true });
        } catch (error) { reply(ack, { ok: false, error: error.message }); }
    });
    socket.on('game:reset-scores', async (_payload, ack) => {
        try { resetScores(); await saveState(); broadcastState(); reply(ack, { ok: true }); }
        catch (error) { reply(ack, { ok: false, error: error.message }); }
    });
    socket.on('game:hard-reset', async (_payload, ack) => {
        try { state = initialState(); await saveState(); broadcastState(); reply(ack, { ok: true }); }
        catch (error) { reply(ack, { ok: false, error: error.message }); }
    });
});

cards = await loadCards();
await ensureDatabase();
await loadLocalBackup();
httpServer.listen(port, '0.0.0.0', () => console.log(`Backend listo en el puerto ${port}`));
