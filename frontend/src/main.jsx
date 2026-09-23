import React, { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import "./styles.css";

const apiHost = import.meta.env.VITE_API_HOST || "localhost:10000";
const apiUrl = apiHost.startsWith("http")
  ? apiHost
  : `${location.protocol === "https:" ? "https" : "http"}://${apiHost}`;
const hostToken = import.meta.env.VITE_HOST_TOKEN || "dev-host";
let audioContext;

function playGameSound(type) {
  if (typeof window === "undefined") return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  audioContext ||= new AudioContext();
  const now = audioContext.currentTime;
  const oscillator = audioContext.createOscillator();
  const gain = audioContext.createGain();
  oscillator.type = type === "strike" ? "sawtooth" : "triangle";
  oscillator.frequency.setValueAtTime(type === "strike" ? 150 : 520, now);
  oscillator.frequency.exponentialRampToValueAtTime(
    type === "strike" ? 80 : 780,
    now + 0.16,
  );
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.16, now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
  oscillator.connect(gain).connect(audioContext.destination);
  oscillator.start(now);
  oscillator.stop(now + 0.21);
  audioContext.resume().catch(() => {});
}
const blankState = {
  scores: { red: 0, white: 0 },
  teamNames: { red: "ROJO", white: "BLANCO" },
  strikes: { red: 0, white: 0 },
  lastStrikeTeam: null,
  currentCard: null,
  wrongAnswers: 0,
  status: "waiting",
  usedCards: [],
  skippedCards: [],
};

function useGameState(isHost) {
  const [state, setState] = useState(blankState);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const socket = isHost
      ? io(`${apiUrl}/host`, {
          auth: { token: hostToken },
          transports: ["websocket", "polling"],
          timeout: 15000,
          reconnection: true,
        })
      : io(apiUrl, {
          transports: ["websocket", "polling"],
          timeout: 15000,
          reconnection: true,
        });
    socket.on("connect", () => {
      setConnected(true);
      setError("");
    });
    socket.on("disconnect", (reason) => {
      setConnected(false);
      if (reason !== "io client disconnect") setError("Backend desconectado");
    });
    socket.on("connect_error", (event) => setError(event.message));
    socket.on("state:update", setState);
    window.gameSocket = socket;
    return () => {
      socket.disconnect();
      delete window.gameSocket;
    };
  }, [isHost]);
  return { state, connected, error };
}

function send(event, payload = {}) {
  return new Promise((resolve) => {
    if (!window.gameSocket?.connected) {
      resolve({ ok: false, error: "El backend no esta conectado" });
      return;
    }
    window.gameSocket.emit(event, payload, resolve);
  });
}

function TeamScore({ name, value, color, strikes }) {
  return (
    <div className={`team-score-group ${color}`}>
      <div className="team-score">
        <span>{name}</span>
        <strong>{value}</strong>
      </div>
      <Strikes count={strikes} />
    </div>
  );
}

function QuestionHeader({ state }) {
  return (
    <header className="question-header">
      <div className="show-badge">100</div>
      <p className="eyebrow">La encuesta dice</p>
      <h1>
        {state.currentCard?.question || "Esperando la siguiente pregunta"}
      </h1>
    </header>
  );
}

function Strikes({ count, label }) {
  return (
    <div
      className="strikes"
      aria-label={`${label || "Equipo"}: ${count} errores`}
    >
      {label && <span className="strike-label">{label}</span>}
      <span className="strike-count">{count ? "X".repeat(count) : "—"}</span>
    </div>
  );
}

function ScreenNav({ current }) {
  return (
    <nav
      className={`screen-nav ${current}`}
      aria-label="Navegacion de pantallas"
    >
      <a className={current === "board" ? "active" : ""} href="/">
        Tablero
      </a>
      <a className={current === "host" ? "active" : ""} href="/host">
        Host
      </a>
    </nav>
  );
}

function ConnectionBanner({ connected, error }) {
  const message = connected
    ? "Backend conectado · EN VIVO"
    : "Esperando backend · RECONECTANDO";
  return (
    <div
      className={`connection-banner ${connected ? "online" : "offline"}`}
      role="status"
    >
      <span className="connection-dot" />
      <strong>{message}</strong>
      {error && <span>{error}</span>}
    </div>
  );
}

function SyncButton({ syncing, onClick }) {
  return (
    <button className="sync-button" onClick={onClick} disabled={syncing}>
      {syncing ? "Sincronizando..." : "↻ Sincronizar"}
    </button>
  );
}

function StrikeOverlay({ team, count, name, stolenBy }) {
  if (!team) return null;
  if (stolenBy) {
    return (
      <div className="board-strike-overlay steal-overlay" aria-live="assertive">
        <span key={`steal-${stolenBy}`}>
          <strong>ROBO DE PUNTOS</strong>
        </span>
      </div>
    );
  }
  return (
    <div className={`board-strike-overlay ${team}`} aria-live="assertive">
      <span key={`${team}-${count}`}>
        <b>{name}</b>
        <strong>{"X".repeat(count || 1)}</strong>
      </span>
    </div>
  );
}

function Board() {
  const { state, connected, error } = useGameState(false);
  const [syncing, setSyncing] = useState(false);
  const card = state.currentCard;
  const teamNames = state.teamNames || blankState.teamNames;
  const previousCard = useRef(null);
  const previousStrikes = useRef(state.strikes || blankState.strikes);
  async function syncScreen() {
    setSyncing(true);
    await send("state:request");
    setSyncing(false);
  }
  useEffect(() => {
    const previousRevealed = (previousCard.current?.revealed || []).filter(
      Boolean,
    ).length;
    const currentRevealed = (card?.revealed || []).filter(Boolean).length;
    if (previousCard.current && currentRevealed > previousRevealed) {
      playGameSound("reveal");
    } else if (
      (state.strikes?.red || 0) > previousStrikes.current.red ||
      (state.strikes?.white || 0) > previousStrikes.current.white
    ) {
      playGameSound("strike");
    }
    previousCard.current = card;
    previousStrikes.current = state.strikes || blankState.strikes;
  }, [card, state.strikes?.red, state.strikes?.white]);
  return (
    <main className="board-page">
      <div className="sunburst" />
      <div className="board-status">
        <SyncButton syncing={syncing} onClick={syncScreen} />
        <ConnectionBanner connected={connected} error={error} />
      </div>
      <div className="board-shell">
        <StrikeOverlay
          team={state.lastStrikeTeam}
          count={state.strikes?.[state.lastStrikeTeam] || 0}
          name={teamNames[state.lastStrikeTeam]}
          stolenBy={card?.stolenBy}
        />
        <QuestionHeader state={state} />
        <div className="board-scores">
          <TeamScore
            name={teamNames.red}
            value={state.scores.red}
            color="red"
            strikes={state.strikes?.red || 0}
          />
          <TeamScore
            name={teamNames.white}
            value={state.scores.white}
            color="white"
            strikes={state.strikes?.white || 0}
          />
        </div>
        <section className="answer-board" aria-live="polite">
          {(card?.answers || Array(6).fill("")).map((answer, index) => {
            const reveal = card?.revealed?.[index];
            return (
              <div
                className={`answer-row ${reveal ? "revealed" : ""}`}
                key={`${answer}-${index}`}
              >
                <span className="answer-index">{index + 1}</span>
                {reveal && (
                  <span
                    className={`answer-team-dot ${reveal.team}`}
                    title={`Respondio ${teamNames[reveal.team]}`}
                  />
                )}
                <span className="answer-text">
                  {reveal ? answer : "••••••••••••••••"}
                </span>
                <span className="answer-points">
                  {reveal ? reveal.points : card ? "—" : ""}
                </span>
              </div>
            );
          })}
        </section>
        <div className="board-footer">
          <span className="connection">
            {connected ? "EN VIVO" : "RECONECTANDO"}
          </span>
        </div>
      </div>
      <ScreenNav current="board" />
    </main>
  );
}

function Host() {
  const { state, connected, error } = useGameState(true);
  const [scores, setScores] = useState(state.scores);
  const [teamNames, setTeamNames] = useState(
    state.teamNames || blankState.teamNames,
  );
  const [message, setMessage] = useState("");
  const [syncing, setSyncing] = useState(false);
  useEffect(
    () => setScores(state.scores),
    [state.scores.red, state.scores.white],
  );
  useEffect(
    () => setTeamNames(state.teamNames || blankState.teamNames),
    [state.teamNames?.red, state.teamNames?.white],
  );
  const card = state.currentCard;
  async function action(event, payload) {
    const result = await send(event, payload);
    if (result?.ok && event === "game:reveal") playGameSound("reveal");
    if (result?.ok && event === "game:strike") playGameSound("strike");
    setMessage(
      result?.ok
        ? "Guardado"
        : result?.error || "No se pudo completar la accion",
    );
    window.setTimeout(() => setMessage(""), 2200);
  }
  const displayTeamNames = state.teamNames || teamNames;
  async function syncScreen() {
    setSyncing(true);
    const result = await send("state:request");
    setMessage(result?.ok ? "Pantalla sincronizada" : result?.error);
    setSyncing(false);
    window.setTimeout(() => setMessage(""), 2200);
  }
  return (
    <main className="host-page">
      <div className="host-topbar">
        <div>
          <span className="eyebrow">PANEL DE HOST</span>
          <h1>100 Mexicanos Dijeron</h1>
        </div>
        <div className="host-top-actions">
          <SyncButton syncing={syncing} onClick={syncScreen} />
          <span className={`status-pill ${connected ? "online" : ""}`}>
            {connected ? "Conectado" : "Sin conexión"}
          </span>
        </div>
      </div>
      <ConnectionBanner connected={connected} error={error} />
      {error && (
        <div className="alert">
          {error}. Revisa VITE_HOST_TOKEN y la URL del backend.
        </div>
      )}
      <section className="host-grid">
        <div className="control-panel current-panel">
          <div className="panel-heading">
            <span>Tarjeta actual</span>
            <strong>
              {state.usedCards.length + state.skippedCards.length} usadas
            </strong>
          </div>
          <h2>{card?.question || "Aún no hay una pregunta activa"}</h2>
          <div className="host-actions">
            <button className="primary" onClick={() => action("game:new-card")}>
              Nueva pregunta
            </button>
          </div>
        </div>
        <div className="control-panel strikes-panel">
          <div className="panel-heading">
            <span>Errores</span>
            <strong>Por equipo</strong>
          </div>
          <Strikes
            count={state.strikes?.red || 0}
            label={displayTeamNames.red}
          />
          <button
            className="danger wide"
            onClick={() => action("game:strike", { team: "red" })}
            disabled={!card || (state.strikes?.red || 0) >= 3}
          >
            X {displayTeamNames.red}
          </button>
          <Strikes
            count={state.strikes?.white || 0}
            label={displayTeamNames.white}
          />
          <button
            className="danger wide"
            onClick={() => action("game:strike", { team: "white" })}
            disabled={!card || (state.strikes?.white || 0) >= 3}
          >
            X {displayTeamNames.white}
          </button>
          {state.strikes?.red >= 3 && !card?.stolenBy && (
            <button
              className="steal-button wide"
              onClick={() =>
                action("game:steal", { fromTeam: "red", toTeam: "white" })
              }
            >
              Robo: {displayTeamNames.white}
            </button>
          )}
          {state.strikes?.white >= 3 && !card?.stolenBy && (
            <button
              className="steal-button wide"
              onClick={() =>
                action("game:steal", { fromTeam: "white", toTeam: "red" })
              }
            >
              Robo: {displayTeamNames.red}
            </button>
          )}
        </div>
        <div className="control-panel answers-panel">
          <div className="panel-heading">
            <span>Revelar respuesta</span>
            <strong>Elige equipo</strong>
          </div>
          {(card?.answers || []).map((answer, index) => {
            const reveal = card.revealed[index];
            return (
              <div
                className={`host-answer ${reveal ? "revealed" : ""}`}
                aria-disabled={Boolean(reveal)}
              >
                <span>
                  <b>{index + 1}</b>
                  {answer}
                  <small>{card.points[index]} puntos</small>
                </span>
                <div>
                  <button
                    className="red-button"
                    onClick={() =>
                      action("game:reveal", { answerIndex: index, team: "red" })
                    }
                    disabled={Boolean(reveal)}
                  >
                    {displayTeamNames.red}
                  </button>
                  <button
                    className="light-button"
                    onClick={() =>
                      action("game:reveal", {
                        answerIndex: index,
                        team: "white",
                      })
                    }
                    disabled={Boolean(reveal)}
                  >
                    {displayTeamNames.white}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="control-panel score-panel">
          <div className="panel-heading">
            <span>Marcador manual</span>
            <strong>Corrección</strong>
          </div>
          <label>
            {displayTeamNames.red}
            <input
              type="number"
              min="0"
              value={scores.red}
              onChange={(event) =>
                setScores({ ...scores, red: Number(event.target.value) || 0 })
              }
            />
          </label>
          <label>
            {displayTeamNames.white}
            <input
              type="number"
              min="0"
              value={scores.white}
              onChange={(event) =>
                setScores({ ...scores, white: Number(event.target.value) || 0 })
              }
            />
          </label>
          <button
            className="secondary wide"
            onClick={() => action("game:set-scores", scores)}
          >
            Guardar marcador
          </button>
          <button
            className="secondary wide"
            onClick={() => action("game:reset-scores")}
          >
            Reiniciar puntuaciones
          </button>
          <div className="team-name-fields">
            <label>
              Nombre equipo rojo
              <input
                maxLength="24"
                value={teamNames.red}
                onChange={(event) =>
                  setTeamNames({ ...teamNames, red: event.target.value })
                }
              />
            </label>
            <label>
              Nombre equipo blanco
              <input
                maxLength="24"
                value={teamNames.white}
                onChange={(event) =>
                  setTeamNames({ ...teamNames, white: event.target.value })
                }
              />
            </label>
            <button
              className="secondary wide"
              onClick={() => action("game:set-team-names", teamNames)}
            >
              Guardar nombres
            </button>
          </div>
        </div>
        <div className="control-panel reset-panel">
          <div className="panel-heading">
            <span>Partida</span>
            <strong>Zona de control</strong>
          </div>
          <p>
            El reinicio total borra marcadores, tarjeta actual y el historial de
            preguntas.
          </p>
          <button
            className="danger wide"
            onClick={() => {
              if (window.confirm("¿Hacer hard reset de toda la partida?"))
                action("game:hard-reset");
            }}
          >
            Hard reset
          </button>
        </div>
      </section>
      <footer className="host-footer">
        <span>Tablero público: {apiUrl}</span>
        {message && <strong>{message}</strong>}
        <span className="connection">
          {connected ? "Socket activo" : "Esperando backend"}
        </span>
      </footer>
      <ScreenNav current="host" />
    </main>
  );
}

function App() {
  return location.pathname.toLowerCase().startsWith("/host") ? (
    <Host />
  ) : (
    <Board />
  );
}
createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
