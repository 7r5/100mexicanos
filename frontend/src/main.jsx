import React, { StrictMode, useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import "./styles.css";

const apiHost = import.meta.env.VITE_API_HOST || "localhost:10000";
const apiUrl = apiHost.startsWith("http")
  ? apiHost
  : `${location.protocol === "https:" ? "https" : "http"}://${apiHost}`;
const hostToken = import.meta.env.VITE_HOST_TOKEN || "dev-host";
const soundModules = import.meta.glob("./sounds/*.{mp3,wav,ogg,m4a,aac,flac}", {
  eager: false,
  import: "default",
});

function normalizeSoundKey(filePath) {
  return filePath
    .split("/")
    .pop()
    .replace(/\.[^/.]+$/, "")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

async function getSoundLibrary() {
  const entries = await Promise.all(
    Object.entries(soundModules).map(async ([filePath, importer]) => {
      const src = await importer();
      const key = normalizeSoundKey(filePath);
      return {
        key,
        label: key.replace(/\b\w/g, (char) => char.toUpperCase()),
        src,
      };
    }),
  );
  return entries.sort((left, right) => left.label.localeCompare(right.label));
}

let activeAudio = null;

function stopCurrentAudio() {
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.currentTime = 0;
    activeAudio = null;
  }
}

function playAudioSource(src, onEnded) {
  stopCurrentAudio();
  const audio = new Audio(src);
  audio.volume = 0.9;
  audio.addEventListener("ended", () => {
    if (activeAudio === audio) activeAudio = null;
    if (onEnded) onEnded();
  });
  activeAudio = audio;
  audio.play().catch(() => {});
  return audio;
}

let soundLibraryPromise = null;
function ensureSoundLibrary() {
  if (!soundLibraryPromise) soundLibraryPromise = getSoundLibrary();
  return soundLibraryPromise;
}

async function playGameSound(type) {
  const keys = {
    start: "a jugar",
    correct: "correcto",
    incorrect: "incorrecto",
    victory: "triunfo",
  };
  const key = keys[type];
  if (!key) return;
  const library = await ensureSoundLibrary();
  const sound = library.find((entry) => entry.key === key);
  if (!sound) return;
  playAudioSource(sound.src);
}
const blankState = {
  scores: { red: 0, white: 0 },
  teamNames: { red: "ROJO", white: "BLANCO" },
  strikes: { red: 0, white: 0 },
  lastStrikeTeam: null,
  status: "waiting",
  currentCard: null,
  wrongAnswers: 0,
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
        <div className="team-score-info">
          <span>{name}</span>
          <strong>{value}</strong>
        </div>
        <Strikes count={strikes} />
      </div>
    </div>
  );
}

function QuestionHeader({ state }) {
  return (
    <header className="question-header">
      <div className="show-badge">100</div>
      <p className="eyebrow">La encuesta dice</p>
      <h1>{state.currentCard?.question || "Esperando al host"}</h1>
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
        {count === 2 && (
          <em className="steal-warning">¡Prepárense para robar!</em>
        )}
      </span>
    </div>
  );
}

function GameFinishedOverlay({ state }) {
  if (state.status !== "finished") return null;
  const teamNames = state.teamNames || blankState.teamNames;
  return (
    <div className="game-finished-overlay" role="status">
      <strong>PARTIDA FINALIZADA</strong>
      <div>
        {teamNames.red}: {state.scores.red} · {teamNames.white}:{" "}
        {state.scores.white}
      </div>
    </div>
  );
}

function RoundPoints({ points }) {
  return <strong className="round-points">Ronda: {points || 0}</strong>;
}

function Board() {
  const { state, connected, error } = useGameState(false);
  const [syncing, setSyncing] = useState(false);
  const [soundLibrary, setSoundLibrary] = useState([]);
  const card = state.currentCard;
  const teamNames = state.teamNames || blankState.teamNames;
  const previousCard = useRef(null);
  const previousStrikes = useRef(state.strikes || blankState.strikes);
  const previousQuestionVisible = useRef(false);
  const previousStatus = useRef("waiting");
  async function syncScreen() {
    setSyncing(true);
    await send("state:request");
    setSyncing(false);
  }
  useEffect(() => {
    let active = true;
    getSoundLibrary().then((library) => {
      if (active) setSoundLibrary(library);
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!window.gameSocket) return undefined;
    const onPlaySound = ({ soundKey }) => {
      if (!soundKey) return;
      const sound = soundLibrary.find((entry) => entry.key === soundKey);
      if (!sound) return;
      playAudioSource(sound.src);
    };
    const onStopSound = () => stopCurrentAudio();
    window.gameSocket.on("sound:play", onPlaySound);
    window.gameSocket.on("sound:stop", onStopSound);
    return () => {
      window.gameSocket.off("sound:play", onPlaySound);
      window.gameSocket.off("sound:stop", onStopSound);
    };
  }, [soundLibrary]);
  useEffect(() => {
    const previousRevealed = previousCard.current?.revealed || [];
    const currentRevealed = card?.revealed || [];
    const newlyScored = currentRevealed.some(
      (reveal, index) =>
        reveal && !reveal.displayOnly && !previousRevealed[index],
    );
    if (previousCard.current && newlyScored) {
      playGameSound("correct");
    } else if (
      (state.strikes?.red || 0) > previousStrikes.current.red ||
      (state.strikes?.white || 0) > previousStrikes.current.white
    ) {
      playGameSound("incorrect");
    }
    previousCard.current = card;
    previousStrikes.current = state.strikes || blankState.strikes;
  }, [card, state.strikes?.red, state.strikes?.white]);
  useEffect(() => {
    const questionVisible = Boolean(card?.questionVisible);
    if (questionVisible && !previousQuestionVisible.current)
      playGameSound("start");
    if (state.status === "finished" && previousStatus.current !== "finished")
      playGameSound("victory");
    previousQuestionVisible.current = questionVisible;
    previousStatus.current = state.status;
  }, [card?.questionVisible, state.status]);
  return (
    <main className="board-page">
      <div className="sunburst" />
      <div className="board-status">
        <SyncButton syncing={syncing} onClick={syncScreen} />
        <ConnectionBanner connected={connected} error={error} />
      </div>
      <div className="board-shell">
        <GameFinishedOverlay state={state} />
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
        <div className="board-round-points">
          <RoundPoints points={card?.roundPoints} />
        </div>
        <section className="answer-board" aria-live="polite">
          {(card?.answers?.length ? card.answers : Array(6).fill("")).map(
            (answer, index) => {
              const reveal = card?.revealed?.[index];
              return (
                <div
                  className={`answer-row ${reveal ? "revealed" : ""}`}
                  key={`${answer}-${index}`}
                >
                  <span className="answer-index">{index + 1}</span>
                  {reveal?.team && (
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
            },
          )}
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
  const [soundLibrary, setSoundLibrary] = useState([]);
  const [message, setMessage] = useState("");
  const [syncing, setSyncing] = useState(false);
  const [playingSoundKey, setPlayingSoundKey] = useState(null);
  useEffect(
    () => setScores(state.scores),
    [state.scores.red, state.scores.white],
  );
  useEffect(
    () => setTeamNames(state.teamNames || blankState.teamNames),
    [state.teamNames?.red, state.teamNames?.white],
  );
  useEffect(() => {
    let active = true;
    getSoundLibrary().then((library) => {
      if (active) setSoundLibrary(library);
    });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!window.gameSocket) return undefined;
    const onPlaySound = ({ soundKey }) => {
      if (!soundKey) return;
      const sound = soundLibrary.find((entry) => entry.key === soundKey);
      if (!sound) return;
      playAudioSource(sound.src);
    };
    window.gameSocket.on("sound:play", onPlaySound);
    return () => {
      window.gameSocket.off("sound:play", onPlaySound);
    };
  }, [soundLibrary]);
  const card = state.currentCard;
  async function action(event, payload) {
    const result = await send(event, payload);
    if (result?.ok && event === "game:reveal-question") playGameSound("start");
    if (result?.ok && event === "game:reveal" && result.scored)
      playGameSound("correct");
    if (result?.ok && event === "game:strike") playGameSound("incorrect");
    if (result?.ok && event === "game:end-game") playGameSound("victory");
    setMessage(
      result?.ok
        ? "Guardado"
        : result?.error || "No se pudo completar la accion",
    );
    window.setTimeout(() => setMessage(""), 2200);
  }
  async function playSoundToViewer(sound) {
    if (playingSoundKey === sound.key) {
      stopCurrentAudio();
      setPlayingSoundKey(null);
      await send("game:stop-sound");
      return;
    }
    const result = await send("game:play-sound", { soundKey: sound.key });
    if (result?.ok) {
      playAudioSource(sound.src, () =>
        setPlayingSoundKey((current) =>
          current === sound.key ? null : current,
        ),
      );
      setPlayingSoundKey(sound.key);
      setMessage(`Reproduciendo: ${sound.label}`);
      window.setTimeout(() => setMessage(""), 1800);
      return;
    }
    setMessage(result?.error || "No se pudo reproducir el sonido");
    window.setTimeout(() => setMessage(""), 1800);
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
            {card && !card.questionVisible && (
              <button
                className="secondary"
                onClick={() => action("game:reveal-question")}
              >
                Revelar pregunta
              </button>
            )}
          </div>
        </div>
        <div className="control-panel sound-panel">
          <div className="panel-heading">
            <span>Sonidos</span>
            <strong>Vista jugador</strong>
          </div>
          <div className="sound-grid">
            {soundLibrary.length === 0 && (
              <span className="empty-state">Cargando sonidos...</span>
            )}
            {soundLibrary.map((sound) => {
              const isPlaying = playingSoundKey === sound.key;
              return (
                <button
                  key={sound.key}
                  className={`secondary sound-choice ${isPlaying ? "playing" : ""}`}
                  onClick={() => playSoundToViewer(sound)}
                >
                  <span>{sound.label}</span>
                  <small>{isPlaying ? "■ stop" : "▶ play"}</small>
                </button>
              );
            })}
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
          {state.strikes?.red === 2 && (
            <small className="steal-reminder">
              ¡Prepara al {displayTeamNames.white} para robar!
            </small>
          )}
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
          {state.strikes?.white === 2 && (
            <small className="steal-reminder">
              ¡Prepara al {displayTeamNames.red} para robar!
            </small>
          )}
          {card &&
            state.strikes?.red >= 3 &&
            !card?.stolenBy &&
            !card?.awardedTo && (
              <button
                className="steal-button wide"
                onClick={() =>
                  action("game:steal", { fromTeam: "red", toTeam: "white" })
                }
              >
                Robo: {displayTeamNames.white}
              </button>
            )}
          {card &&
            state.strikes?.white >= 3 &&
            !card?.stolenBy &&
            !card?.awardedTo && (
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
            <strong>Acumulado: {card?.roundPoints || 0}</strong>
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
                    className="secondary"
                    onClick={() =>
                      action("game:reveal", { answerIndex: index })
                    }
                    disabled={Boolean(reveal)}
                  >
                    Revelar
                  </button>
                </div>
              </div>
            );
          })}
          {card && !card.awardedTo && !card.revealed?.every(Boolean) && (
            <small className="award-round-hint">
              Las respuestas sin revelar se mostrarán al público sin sumar
              puntos.
            </small>
          )}
          <div className="award-round-actions">
            <strong>
              {state.strikes?.red >= 3 || state.strikes?.white >= 3
                ? `Robo: ¿quién se lleva los ${card?.roundPoints || 0} puntos?`
                : `¿A quién van los ${card?.roundPoints || 0} puntos?`}
            </strong>
            <button
              className="red-button"
              onClick={() => action("game:award-round", { team: "red" })}
              disabled={!card || Boolean(card.awardedTo)}
            >
              {displayTeamNames.red}
            </button>
            <button
              className="light-button"
              onClick={() => action("game:award-round", { team: "white" })}
              disabled={!card || Boolean(card.awardedTo)}
            >
              {displayTeamNames.white}
            </button>
          </div>
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
          <button
            className="victory-button wide"
            onClick={() => action("game:end-game")}
            disabled={!card || state.status === "finished"}
          >
            Finalizar partida
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
