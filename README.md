# 100 Mexicanos Dijeron

Aplicacion web para jugar en persona con un host y un tablero publico. El firmware de la carpeta `firmware/` es independiente y no participa en la aplicacion web.

## Arquitectura

- `frontend/`: sitio estatico React/Vite con las vistas `/board` y `/host`.
- `backend/`: API y servidor Socket.IO con Node.js.
- PostgreSQL: persistencia del estado actual de la partida.
- `data.csv`: preguntas y seis respuestas ordenadas.
- `render.yaml`: despliegue de sitio estatico, backend y PostgreSQL en Render.

## Ejecutar localmente

En una terminal:

```sh
cd backend
npm install
npm start
```

En otra terminal:

```sh
cd frontend
npm install
npm run dev
```

Abre la URL de Vite para el tablero. Para el host usa `/host`. En local, el backend usa `backend/data/game-state.json` si no existe `DATABASE_URL`; en Render usa PostgreSQL.

Para conectar el host en local, define `VITE_HOST_TOKEN=dev-host` si cambias el valor por defecto. En producción, `VITE_API_HOST` y `VITE_HOST_TOKEN` se configuran en `render.yaml`.

## Como se juega

1. Abre `/host` en el dispositivo del presentador.
2. Abre `/board` en la pantalla publica.
3. Pulsa `Nueva pregunta`.
4. Cuando un equipo adivine, revela la respuesta usando `Rojo` o `Blanco`; sus puntos se suman una sola vez.
5. Usa `Mandar X` para registrar errores y `Saltar pregunta` para consumir una tarjeta sin mostrarla.
6. `Reiniciar puntuaciones` conserva el historial de tarjetas. `Hard reset` borra toda la partida, incluido el historial de tarjetas usadas y saltadas.

Los seis puntos se generan por tarjeta con variacion aleatoria, siempre en orden descendente y con valores entre 20 y 50. Se guardan junto con el estado de la tarjeta.

## Render Blueprint

El Blueprint crea dos servicios web gratuitos y una base PostgreSQL gratuita. El backend recibe `DATABASE_URL` desde la base y guarda el estado antes de emitir cada actualizacion por Socket.IO. Cambia `HOST_TOKEN` y el valor correspondiente de `VITE_HOST_TOKEN` antes de usar el despliegue.

La base PostgreSQL es la fuente persistente. El archivo JSON local solo es un respaldo para desarrollo cuando no hay `DATABASE_URL`.
