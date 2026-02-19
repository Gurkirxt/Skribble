import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";

const port = process.env.PORT || 8080;

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { /* options */ });

let activeRooms = new Map<string, Set<User>>();

interface User {
  username: string;
}

function generateRoomCode(length: number): string {
  let roomCode: string = "";
  const chars: string = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  for (let i = 0; i < length; i++) {
    roomCode += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return roomCode;
}

function generateUniqueRoom(length: number = 6): string {
  let roomCode: string = generateRoomCode(length);
  while (activeRooms.has(roomCode)) {
    roomCode = generateRoomCode(length);
  }
  activeRooms.set(roomCode, new Set<User>());
  return roomCode;
}

app.post('/createRoom', (req, res) => {
  let roomID = generateUniqueRoom();
  activeRooms.get(roomID)?.add(user);
})

app.get('/joinRoom/:id', (req, res) => {
  const roomId = req.params.id;
  activeRooms.get(roomId)?.add(user);

})

io.on("connection", (socket) => {
  socket.join(roomID);
})

io.on("connecton", (socket) => {
  socket.join(roomId);
})

httpServer.listen(port);
