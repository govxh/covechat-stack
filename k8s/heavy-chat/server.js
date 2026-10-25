// Heavy gate test server — a chat-like workload DELIBERATELY heavier
// than CoveChat's real usage on every axis, so passing it is stronger
// capacity proof than the trivial demo service. Synthetic only: no real
// app, no real users, no real data. Runs in a throwaway kind cluster.
//
// Per message the server does: 1 Postgres INSERT + 1 history SELECT +
// broadcast to every member of the sender's room. Plus HTTP attachment
// uploads stored in the stack's MinIO. All credentials here are the
// same public demo placeholders already used by this repo's MinIO chart
// values — never real secrets.
'use strict';

const http = require('http');
const { WebSocketServer } = require('ws');
const { Pool } = require('pg');
const Minio = require('minio');

const PORT = 8080;
const rooms = new Map(); // room id -> Set of sockets
const stats = {
  connectionsPeak: 0,
  connectionsNow: 0,
  messagesIn: 0,
  broadcastsOut: 0,
  dbErrors: 0,
  uploads: 0,
  uploadBytes: 0,
};

const pool = new Pool({
  host: process.env.PGHOST || 'postgres.heavy.svc.cluster.local',
  port: 5432,
  user: process.env.PGUSER || 'heavy',
  password: process.env.PGPASSWORD || 'heavy-demo-password',
  database: process.env.PGDATABASE || 'heavy',
  max: 20,
});

const minio = new Minio.Client({
  endPoint: process.env.MINIO_HOST || 'minio.storage.svc.cluster.local',
  port: 9000,
  useSSL: false,
  accessKey: process.env.MINIO_USER || 'minioadmin',
  secretKey: process.env.MINIO_PASS || 'minioadmin',
});
const BUCKET = 'heavy';

async function init() {
  await pool.query(
    'CREATE TABLE IF NOT EXISTS messages ' +
      '(id SERIAL PRIMARY KEY, room INT NOT NULL, text TEXT NOT NULL, ts BIGINT NOT NULL)'
  );
  try {
    await minio.makeBucket(BUCKET, 'us-east-1');
  } catch (e) {
    if (e.code !== 'BucketAlreadyOwnedByYou' && e.code !== 'BucketAlreadyExists') throw e;
  }
  console.log('heavy-chat: db table + minio bucket ready');
}

function roomSet(room) {
  if (!rooms.has(room)) rooms.set(room, new Set());
  return rooms.get(room);
}

const server = http.createServer((req, res) => {
  if (req.url === '/healthz') {
    res.writeHead(200);
    res.end('ok');
    return;
  }
  if (req.url === '/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats));
    return;
  }
  if (req.url === '/upload' && req.method === 'POST') {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      const body = Buffer.concat(chunks);
      const key = `upload-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      try {
        await minio.putObject(BUCKET, key, body);
        stats.uploads += 1;
        stats.uploadBytes += body.length;
        res.writeHead(200);
        res.end('ok');
      } catch (e) {
        console.error('upload failed', e.message);
        res.writeHead(500);
        res.end('upload failed');
      }
    });
    return;
  }
  res.writeHead(404);
  res.end('not found');
});

const wss = new WebSocketServer({ server, path: '/chat' });
wss.on('connection', (ws, req) => {
  const url = new URL(req.url, 'http://localhost');
  const room = url.searchParams.get('room') || '0';
  const set = roomSet(room);
  set.add(ws);
  stats.connectionsNow += 1;
  if (stats.connectionsNow > stats.connectionsPeak) stats.connectionsPeak = stats.connectionsNow;
  ws.on('message', async (data) => {
    stats.messagesIn += 1;
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch {
      return;
    }
    const roomId = parseInt(room, 10) || 0;
    try {
      await pool.query('INSERT INTO messages (room, text, ts) VALUES ($1, $2, $3)', [
        roomId,
        msg.text || '',
        msg.ts || 0,
      ]);
      await pool.query('SELECT id, text FROM messages WHERE room = $1 ORDER BY id DESC LIMIT 5', [
        roomId,
      ]);
    } catch (e) {
      stats.dbErrors += 1;
      console.error('db error', e.message);
    }
    const out = JSON.stringify({ room, text: msg.text || '', ts: msg.ts || 0 });
    for (const client of set) {
      if (client.readyState === 1) {
        client.send(out);
        stats.broadcastsOut += 1;
      }
    }
  });
  ws.on('close', () => {
    set.delete(ws);
    stats.connectionsNow -= 1;
  });
  ws.on('error', () => {});
});

init()
  .then(() => {
    server.listen(PORT, '0.0.0.0', () => console.log(`heavy-chat listening on ${PORT}`));
  })
  .catch((e) => {
    console.error('init failed', e);
    process.exit(1);
  });
