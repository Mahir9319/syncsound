const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const multer = require("multer");
const QRCode = require("qrcode");
const crypto = require("crypto");

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }
});

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Frontend-Origin");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.static("public"));

const rooms = new Map();

function code() {
  let c;
  do c = crypto.randomBytes(3).toString("hex").toUpperCase();
  while (rooms.has(c));
  return c;
}

function send(ws, msg) {
  if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
function broadcast(room, msg, except) {
  for (const ws of room.clients) if (ws !== except) send(ws, msg);
}
function publicSong(room) {
  return room.song ? {
    name: room.song.name,
    mime: room.song.mime,
    size: room.song.data.length,
    url: `/api/song/${room.id}`
  } : null;
}

app.post("/api/upload/:room", upload.single("music"), (req, res) => {
  const room = rooms.get(req.params.room.toUpperCase());
  if (!room || !room.host || !req.file) return res.status(400).json({ error: "Invalid room or file" });
  if (!/^audio\//.test(req.file.mimetype)) return res.status(415).json({ error: "Please choose an audio file." });

  room.song = { name: req.file.originalname, mime: req.file.mimetype, data: req.file.buffer };
  room.state = { playing: false, position: 0, at: Date.now() };
  broadcast(room, { type: "song", song: publicSong(room) });
  broadcast(room, { type: "sync", state: room.state });
  res.json({ ok: true, song: publicSong(room) });
});

app.get("/api/song/:room", (req, res) => {
  const room = rooms.get(req.params.room.toUpperCase());
  if (!room || !room.song) return res.status(404).end();
  res.setHeader("Content-Type", room.song.mime);
  res.setHeader("Content-Length", room.song.data.length);
  res.setHeader("Cache-Control", "no-store");
  res.send(room.song.data);
});

app.get("/api/room/:room/qr", async (req, res) => {
  const id = req.params.room.toUpperCase();
  if (!rooms.has(id)) return res.status(404).json({ error: "Room not found" });
  const frontendUrl = process.env.FRONTEND_URL || req.get("X-Frontend-Origin") || req.get("Origin") || `${req.protocol}://${req.get("host")}`;
  const joinUrl = `${frontendUrl.replace(/\/$/, "")}/?room=${id}`;
  res.json({ room: id, joinUrl, qr: await QRCode.toDataURL(joinUrl, { width: 420, margin: 1 }) });
});

wss.on("connection", (ws) => {
  ws.id = crypto.randomBytes(5).toString("hex");
  ws.roomId = null;
  ws.role = "client";

  send(ws, { type: "hello", serverNow: Date.now() });

  ws.on("message", raw => {
    let m;
    try { m = JSON.parse(raw.toString()); } catch { return; }

    if (m.type === "create") {
      const id = code();
      const room = {
        id, host: ws, clients: new Set([ws]), song: null,
        state: { playing: false, position: 0, at: Date.now() }
      };
      rooms.set(id, room);
      ws.roomId = id; ws.role = "host";
      send(ws, { type: "created", room: id, serverNow: Date.now() });
      return;
    }

    if (m.type === "join") {
      const id = String(m.room || "").toUpperCase();
      const room = rooms.get(id);
      if (!room) return send(ws, { type: "error", message: "Room not found." });
      if (ws.roomId) {
        const old = rooms.get(ws.roomId);
        if (old) old.clients.delete(ws);
      }
      ws.roomId = id; ws.role = "client"; room.clients.add(ws);
      send(ws, { type: "joined", room: id, serverNow: Date.now(), song: publicSong(room), state: room.state });
      broadcast(room, { type: "devices", count: room.clients.size });
      return;
    }

    const room = rooms.get(ws.roomId);
    if (!room) return;

    if (m.type === "ping") {
      return send(ws, { type: "pong", clientAt: m.clientAt, serverNow: Date.now() });
    }

    if (ws !== room.host) return;

    if (m.type === "sync") {
      room.state = {
        playing: !!m.playing,
        position: Number(m.position) || 0,
        at: Date.now(),
        startAt: Number(m.startAt) || 0
      };
      broadcast(room, { type: "sync", state: room.state }, ws);
    }
  });

  ws.on("close", () => {
    const room = rooms.get(ws.roomId);
    if (!room) return;
    room.clients.delete(ws);
    if (room.host === ws) {
      broadcast(room, { type: "closed", message: "Host disconnected." });
      rooms.delete(room.id);
    } else {
      broadcast(room, { type: "devices", count: room.clients.size });
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => console.log(`SyncSound listening on ${PORT}`));