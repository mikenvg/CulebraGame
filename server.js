const path = require('node:path');
const express = require('express');
const { MongoClient } = require('mongodb');

const PUBLIC_DIR = path.join(__dirname, 'public');
const LEADERBOARD_LIMIT = 10;
const PLAYER_NAME_MAX_LENGTH = 18;

function createDemoCollection() {
  const scores = [
    { _id: 'demo-1', player: 'NEXUS', score: 240, createdAt: new Date('2026-10-26T10:00:00.000Z') },
    { _id: 'demo-2', player: 'Demo', score: 180, createdAt: new Date('2026-10-26T10:05:00.000Z') },
    { _id: 'demo-3', player: 'PIXEL', score: 180, createdAt: new Date('2026-10-26T10:10:00.000Z') },
    { _id: 'demo-4', player: 'BYTE', score: 120, createdAt: new Date('2026-10-26T10:15:00.000Z') },
  ];

  return {
    async insertOne(score) {
      const insertedId = `demo-${Date.now()}-${scores.length}`;
      scores.push({ _id: insertedId, ...score });
      return { insertedId };
    },
    find() {
      let limit = Infinity;
      return {
        sort() {
          return this;
        },
        limit(value) {
          limit = value;
          return this;
        },
        async toArray() {
          return scores
            .toSorted((first, second) => second.score - first.score || first.createdAt - second.createdAt)
            .slice(0, limit);
        },
      };
    },
  };
}

function validateScore(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    return { error: 'El cuerpo de la petición debe ser un objeto JSON.' };
  }

  if (typeof payload.player !== 'string') {
    return { error: 'El nombre del jugador es obligatorio.' };
  }

  const player = payload.player.trim();
  if (player.length === 0 || player.length > PLAYER_NAME_MAX_LENGTH) {
    return { error: `El nombre debe tener entre 1 y ${PLAYER_NAME_MAX_LENGTH} caracteres.` };
  }

  if (!Number.isSafeInteger(payload.score) || payload.score < 0) {
    return { error: 'La puntuación debe ser un entero positivo o cero.' };
  }

  return { value: { player, score: payload.score, createdAt: new Date() } };
}

function createApp(scoresCollection, { demoMode = false } = {}) {
  const app = express();
  app.use(express.json({ limit: '10kb' }));

  app.get('/api/leaderboard', async (request, response, next) => {
    try {
      const scores = await scoresCollection
        .find({}, { projection: { player: 1, score: 1, createdAt: 1 } })
        .sort({ score: -1, createdAt: 1 })
        .limit(LEADERBOARD_LIMIT)
        .toArray();

      response.set('X-Snake-Demo-Mode', String(demoMode));
      response.json(scores.map(({ _id, player, score, createdAt }) => ({
        id: String(_id),
        player,
        score,
        createdAt,
      })));
    } catch (error) {
      next(error);
    }
  });

  app.post('/api/scores', async (request, response, next) => {
    const result = validateScore(request.body);
    if (result.error) {
      response.status(400).json({ error: result.error });
      return;
    }

    try {
      const insertResult = await scoresCollection.insertOne(result.value);
      response.status(201).json({
        id: String(insertResult.insertedId),
        ...result.value,
      });
    } catch (error) {
      next(error);
    }
  });

  app.use('/api', (request, response) => {
    response.status(404).json({ error: 'Ruta de API no encontrada.' });
  });

  app.use((error, request, response, next) => {
    if (response.headersSent) {
      next(error);
      return;
    }

    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      response.status(400).json({ error: 'El cuerpo debe contener JSON válido.' });
      return;
    }

    console.error(error);
    response.status(500).json({ error: 'Error interno del servidor.' });
  });

  app.use(express.static(PUBLIC_DIR));
  return app;
}

async function startServer() {
  require('dotenv').config();
  const demoMode = /^(1|true|yes)$/i.test(process.env.DEMO_MODE || '');
  const uri = process.env.MONGODB_URI;
  if (!demoMode && !uri) {
    throw new Error('Falta MONGODB_URI. Crea un archivo .env a partir de .env.example.');
  }

  let client;
  let scoresCollection;
  if (demoMode) {
    scoresCollection = createDemoCollection();
  } else {
    client = new MongoClient(uri);
    await client.connect();
    const database = client.db(process.env.MONGODB_DB || 'snake');
    scoresCollection = database.collection('scores');
    await scoresCollection.createIndex({ score: -1, createdAt: 1 });
  }

  const port = Number(process.env.PORT) || 3000;
  const server = createApp(scoresCollection, { demoMode }).listen(port, () => {
    console.log(`Snake disponible en http://localhost:${port}${demoMode ? ' (MODO DEMO: puntuaciones temporales)' : ''}`);
  });

  const closeServer = () => {
    server.close(async () => {
      await client?.close();
      process.exit(0);
    });
  };
  process.on('SIGINT', closeServer);
  process.on('SIGTERM', closeServer);
}

if (require.main === module) {
  startServer().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}

module.exports = { createApp, createDemoCollection };