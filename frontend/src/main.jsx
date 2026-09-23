import React, { StrictMode, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import "./styles.css";

const apiHost = import.meta.env.VITE_API_HOST || "localhost:10000";
const apiUrl = apiHost.startsWith("http")
  ? apiHost
  : `${location.protocol === "https:" ? "https" : "http"}://${apiHost}`;
const hostToken = import.meta.env.VITE_HOST_TOKEN || "dev-host";
const blankState = {
  scores: { red: 0, white: 0 },
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

function TeamScore({ name, value, color }) {
  return (
    <div className={`team-score ${color}`}>
      <span>{name}</span>
      <strong>{value}</strong>
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

function Strikes({ count }) {
  return (
    <div className="strikes" aria-label={`${count} errores`}>
      {[0, 1, 2].map((index) => (
        <span
          className={index < count ? "strike active" : "strike"}
          key={index}
        >
          X
        </span>
      ))}
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
  const message = connected ? "Backend conectado · EN VIVO" : "Esperando backend · RECONECTANDO";
  return (
    <div className={`connection-banner ${connected ? "online" : "offline"}`} role="status">
      <span className="connection-dot" />
      <strong>{message}</strong>
      {error && <span>{error}</span>}
    </div>
  );
}

function Board() {
  const { state, connected, error } = useGameState(false);
  const card = state.currentCard;
  return (
    <main className="board-page">
      <div className="sunburst" />
      <ScreenNav current="board" />
      <div className="board-shell">
        <ConnectionBanner connected={connected} error={error} />
        <QuestionHeader state={state} />
        <div className="board-scores">
          <TeamScore name="ROJO" value={state.scores.red} color="red" />
          <TeamScore name="BLANCO" value={state.scores.white} color="white" />
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
          <Strikes count={state.wrongAnswers} />
          <span className="connection">
            {connected ? "EN VIVO" : "RECONECTANDO"}
          </span>
        </div>
      </div>
    </main>
  );
}

function Host() {
  const { state, connected, error } = useGameState(true);
  const [scores, setScores] = useState(state.scores);
  const [message, setMessage] = useState("");
  useEffect(
    () => setScores(state.scores),
    [state.scores.red, state.scores.white],
  );
  const card = state.currentCard;
  async function action(event, payload) {
    const result = await send(event, payload);
    setMessage(
      result?.ok
        ? "Guardado"
        : result?.error || "No se pudo completar la accion",
    );
    window.setTimeout(() => setMessage(""), 2200);
  }
  return (
    <main className="host-page">
      <ScreenNav current="host" />
      <div className="host-topbar">
        <div>
          <span className="eyebrow">PANEL DE HOST</span>
          <h1>100 Mexicanos Dijeron</h1>
        </div>
        <span className={`status-pill ${connected ? "online" : ""}`}>
          {connected ? "Conectado" : "Sin conexión"}
        </span>
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
            <button
              className="secondary"
              onClick={() => action("game:skip-card")}
              disabled={!card}
            >
              Saltar pregunta
            </button>
          </div>
        </div>
        <div className="control-panel">
          <div className="panel-heading">
            <span>Errores</span>
            <strong>{state.wrongAnswers}/3</strong>
          </div>
          <Strikes count={state.wrongAnswers} />
          <button
            className="danger wide"
            onClick={() => action("game:strike")}
            disabled={!card || state.wrongAnswers >= 3}
          >
            Mandar X
          </button>
        </div>
        <div className="control-panel answers-panel">
          <div className="panel-heading">
            <span>Revelar respuesta</span>
            <strong>Elige equipo</strong>
          </div>
          {(card?.answers || []).map((answer, index) => {
            const reveal = card.revealed[index];
            return (
              <div className="host-answer" key={answer}>
                <span>
                  <b>{index + 1}</b>
                  {answer}
                  <small>{card.points[index]} puntos</small>
                </span>
                <div>
                  <button
                    onClick={() =>
                      action("game:reveal", { answerIndex: index, team: "red" })
                    }
                    disabled={Boolean(reveal)}
                  >
                    Rojo
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
                    Blanco
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
            Rojo
            <input
              type="number"
              min="0"
              value={scores.red}
              onChange={(event) =>
                setScores({ ...scores, red: event.target.value })
              }
            />
          </label>
          <label>
            Blanco
            <input
              type="number"
              min="0"
              value={scores.white}
              onChange={(event) =>
                setScores({ ...scores, white: event.target.value })
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
