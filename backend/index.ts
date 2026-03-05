import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import cors from "cors";
import { registerSocketHandlers } from "./socketHandlers.js";
import { createRoom, getPublicRooms, getRoom } from "./roomManager.js";

const port = process.env.PORT || 8080;

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: "*", // Allow any frontend for now
    methods: ["GET", "POST"]
  }
});

app.post('/api/rooms', (req, res) => {
  const config = req.body.config || {
    isPublic: true,
    drawTime: 80,
    maxPlayers: 8,
    rounds: 3,
    wordChoicesCount: 3,
    hintsEnabled: true
  };
  const room = createRoom(config);
  res.json({ code: room.code });
});

app.get('/api/rooms', (req, res) => {
  res.json(getPublicRooms().map(r => ({ code: r.code, players: r.players.size, maxPlayers: r.config.maxPlayers })));
});

app.get('/api/rooms/:code', (req, res) => {
  const room = getRoom(req.params.code);
  if (room) {
    res.json({ code: room.code, config: room.config });
  } else {
    res.status(404).json({ error: "Room not found" });
  }
});

registerSocketHandlers(io);

httpServer.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
