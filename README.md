# Snake

Juego web con una API Express y puntuaciones almacenadas en MongoDB Atlas.

## Requisitos

- Node.js 20 o posterior (`toSorted()` requiere Node 20 o posterior).
- Una URI de conexión de MongoDB Atlas con permisos de lectura y escritura en la base de datos.

## Arranque local

1. Instala las dependencias con `npm install`.
2. Crea un archivo `.env` con `MONGODB_URI` y, opcionalmente, `MONGODB_DB` y `PORT`. Define `MONGODB_URI` con la URI de tu cluster.
3. Ejecuta `npm start` y abre la URL que aparece en la terminal, normalmente `http://localhost:3000`.

La URI solo se configura en `.env`; no debe añadirse a archivos dentro de `public/` ni compartirse en Git. Express sirve el juego y la API desde el mismo origen.

## API

### `POST /api/scores`

Guarda una partida terminada. El servidor valida y recorta el nombre (1-18 caracteres), valida una puntuación entera no negativa y asigna `createdAt` usando la hora del servidor.

```json
{
  "player": "Ana",
  "score": 30
}
```

Devuelve `201 Created` y el registro guardado. Los datos no válidos devuelven `400 Bad Request`.

### `GET /api/leaderboard`

Devuelve un array con las 10 mejores partidas, ordenadas por puntuación descendente y, en caso de empate, por fecha ascendente (la partida más antigua primero). Cada elemento contiene `id`, `player`, `score` y `createdAt`.

## Pruebas

Ejecuta `npm test`. Las pruebas usan una colección simulada y no necesitan credenciales ni acceso a Atlas.

## Modo de presentación sin Atlas

Si Atlas o Internet no están disponibles, inicia el servidor con `DEMO_MODE=true npm start`. El juego y la API funcionan con una clasificación de demostración en memoria; las puntuaciones nuevas solo duran mientras el proceso siga activo y no se escriben en Atlas. En Windows PowerShell, usa `$env:DEMO_MODE="true"; npm start`. Para volver al modo normal, detén el servidor y ejecuta `npm start` sin esa variable.