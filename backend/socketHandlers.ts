import type { Server } from "socket.io";
import type { Stroke, Player, RoomConfig } from "./types.js";
import {
  getRoom,
  addPlayer,
  reconnectPlayer,
  disconnectPlayer,
  getPlayerBySocket,
  setDrawer,
  setCurrentWord,
} from "./roomManager.js";
import { startGame, wordChosen, checkTurnEndEarly } from "./gameLogic.js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUid(uid: unknown): uid is string {
  return typeof uid === "string" && UUID_RE.test(uid);
}

export function registerSocketHandlers(io: Server): void {
  io.on("connection", (socket) => {
    socket.on(
      "join",
      (payload: { roomCode: string; uid: string; username: string; avatar: Record<string, string[]> }) => {
        const { roomCode, uid, username, avatar } = payload ?? {};
        const code = roomCode?.toUpperCase?.();

        if (!code) {
          socket.emit("error", { message: "roomCode required" });
          return;
        }
        if (!isValidUid(uid)) {
          socket.emit("error", { message: "valid uid required" });
          return;
        }

        const room = getRoom(code);
        if (!room) {
          socket.emit("error", { message: "Room not found" });
          return;
        }

        socket.data.roomCode = code;
        socket.data.uid = uid;

        const existing = room.players.get(uid);

        if (existing) {
          // Reconnect: restore socket, preserve score / hasAnswered
          reconnectPlayer(code, uid, socket.id);
          socket.join(code);

          const playerList = Array.from(room.players.values()).map(serialize);
          socket.emit("roomState", {
            code: room.code,
            config: room.config,
            hostUid: room.hostUid,
            gameState: room.gameState,
            currentRound: room.currentRound,
            players: playerList,
            drawerUid: room.drawerUid,
            strokes: room.strokes,
          });

          socket.to(code).emit("playerReconnected", { uid, username: existing.username });
          return;
        }

        // Fresh join
        if (!username?.trim()) {
          socket.emit("error", { message: "username required" });
          return;
        }

        const player: Player = {
          uid,
          socketId: socket.id,
          username: username.trim(),
          avatar: avatar || {},
          hasAnswered: false,
          score: 0,
          connected: true,
          joinTime: Date.now(),
        };

        const updated = addPlayer(code, player);
        if (!updated) {
          socket.emit("error", { message: "Room is full" });
          return;
        }

        socket.join(code);

        const playerList = Array.from(room.players.values()).map(serialize);
        socket.emit("roomState", {
          code: room.code,
          config: room.config,
          hostUid: room.hostUid,
          gameState: room.gameState,
          currentRound: room.currentRound,
          players: playerList,
          drawerUid: room.drawerUid,
          strokes: room.strokes,
        });

        socket.to(code).emit("playerJoined", serialize(player));
      }
    );

    socket.on("updateConfig", (payload: Partial<RoomConfig>) => {
      const roomCode = socket.data.roomCode as string | undefined;
      const uid = socket.data.uid as string | undefined;
      if (!roomCode || !uid) return;

      const room = getRoom(roomCode);
      if (!room || room.hostUid !== uid || room.gameState !== "waiting") return;

      room.config = { ...room.config, ...payload };
      io.to(roomCode).emit("configUpdated", { config: room.config });
    });

    socket.on("startGame", () => {
      const roomCode = socket.data.roomCode as string | undefined;
      const uid = socket.data.uid as string | undefined;
      if (!roomCode || !uid) return;

      const room = getRoom(roomCode);
      if (!room || room.hostUid !== uid || room.gameState !== "waiting") return;

      startGame(io, room);
    });

    socket.on("chooseWord", (payload: { word: string }) => {
      const roomCode = socket.data.roomCode as string | undefined;
      const uid = socket.data.uid as string | undefined;
      if (!roomCode || !uid) return;

      const room = getRoom(roomCode);
      if (!room || room.drawerUid !== uid || room.gameState !== "choosing_word") return;

      if (!room.wordChoices.includes(payload.word)) return;

      wordChosen(io, room, payload.word);
    });

    socket.on("stroke", (payload: { stroke: Stroke }) => {
      const roomCode = socket.data.roomCode as string | undefined;
      const uid = socket.data.uid as string | undefined;
      if (!roomCode || !uid) return;

      const room = getRoom(roomCode);
      if (!room || room.drawerUid !== uid) return;

      const stroke = payload?.stroke;
      if (!stroke?.id || !Array.isArray(stroke.points)) return;

      room.strokes.push(stroke);
      room.redoStack = [];
      socket.to(roomCode).emit("stroke", { stroke });
    });

    socket.on("undo", () => {
      const roomCode = socket.data.roomCode as string | undefined;
      const uid = socket.data.uid as string | undefined;
      if (!roomCode || !uid) return;

      const room = getRoom(roomCode);
      if (!room || room.drawerUid !== uid || room.strokes.length === 0) return;

      const last = room.strokes.pop()!;
      room.redoStack.push(last);
      io.to(roomCode).emit("canvasUpdate", { strokes: [...room.strokes] });
    });

    socket.on("redo", () => {
      const roomCode = socket.data.roomCode as string | undefined;
      const uid = socket.data.uid as string | undefined;
      if (!roomCode || !uid) return;

      const room = getRoom(roomCode);
      if (!room || room.drawerUid !== uid || room.redoStack.length === 0) return;

      const stroke = room.redoStack.pop()!;
      room.strokes.push(stroke);
      io.to(roomCode).emit("canvasUpdate", { strokes: [...room.strokes] });
    });

    socket.on("chat", (payload: { message: string }) => {
      const roomCode = socket.data.roomCode as string | undefined;
      if (!roomCode) return;

      const room = getRoom(roomCode);
      if (!room) return;

      const player = getPlayerBySocket(room, socket.id);
      if (!player) return;

      const message =
        typeof payload?.message === "string" ? payload.message.trim() : "";
      if (!message) return;

      const isDrawer = room.drawerUid === player.uid;
      
      // Check for answer
      if (!isDrawer && !player.hasAnswered && room.currentWord && room.gameState === "playing") {
        if (room.currentWord.trim().toLowerCase() === message.toLowerCase()) {
          player.hasAnswered = true;
          
          // Calculate score based on remaining time
          const now = Date.now();
          const remainingTime = Math.max(0, (room.roundEndTime || now) - now);
          const maxTime = room.config.drawTime * 1000;
          const timeRatio = remainingTime / maxTime;
          
          // Base score + time bonus (max 500 points)
          const points = Math.floor(100 + (400 * timeRatio));
          player.score += points;
          
          // Give drawer some points too
          const drawer = room.players.get(room.drawerUid!);
          if (drawer) {
            drawer.score += Math.floor(points * 0.2); // Drawer gets 20% of guesser's points
          }

          socket.emit("correctAnswer", { score: points });
          io.to(roomCode).emit("playerAnswered", {
            uid: player.uid,
            username: player.username,
            score: player.score
          });
          
          checkTurnEndEarly(io, room);
          return; // Do not broadcast the correct answer as chat
        }
      }

      const senderAnswered = player.hasAnswered || isDrawer;

      const outgoing = {
        message,
        username: player.username,
        uid: player.uid,
        isAnswered: senderAnswered,
      };

      if (senderAnswered) {
        // Only deliver to answered players and the drawer
        for (const p of room.players.values()) {
          if (!p.connected) continue;
          if (p.hasAnswered || p.uid === room.drawerUid) {
            io.to(p.socketId).emit("chat", outgoing);
          }
        }
      } else {
        io.to(roomCode).emit("chat", outgoing);
      }
    });

    socket.on("setDrawer", (payload: { uid?: string }) => {
      const roomCode = socket.data.roomCode as string | undefined;
      if (!roomCode) return;

      const room = getRoom(roomCode);
      if (!room) return;

      const targetUid = payload?.uid ?? (socket.data.uid as string);
      if (!isValidUid(targetUid) || !room.players.has(targetUid)) return;

      if (setDrawer(roomCode, targetUid)) {
        io.to(roomCode).emit("drawerChange", { drawerUid: targetUid });
      }
    });

    socket.on("setWord", (payload: { word: string }) => {
      const roomCode = socket.data.roomCode as string | undefined;
      const uid = socket.data.uid as string | undefined;
      if (!roomCode || !uid) return;

      const room = getRoom(roomCode);
      if (!room || room.drawerUid !== uid) return;

      const word =
        typeof payload?.word === "string" ? payload.word.trim() : "";
      if (!word) return;

      setCurrentWord(roomCode, word);
    });

    socket.on("answer", (payload: { answer: string }) => {
      const roomCode = socket.data.roomCode as string | undefined;
      if (!roomCode) return;

      const room = getRoom(roomCode);
      if (!room || !room.currentWord || room.gameState !== "playing") return;

      const player = getPlayerBySocket(room, socket.id);
      if (!player || player.hasAnswered || room.drawerUid === player.uid) return;

      const answer =
        typeof payload?.answer === "string"
          ? payload.answer.trim().toLowerCase()
          : "";
      const correct = room.currentWord.trim().toLowerCase() === answer;

      if (correct) {
        player.hasAnswered = true;
        
        // Calculate score based on remaining time
        const now = Date.now();
        const remainingTime = Math.max(0, (room.roundEndTime || now) - now);
        const maxTime = room.config.drawTime * 1000;
        const timeRatio = remainingTime / maxTime;
        
        // Base score + time bonus (max 500 points)
        const points = Math.floor(100 + (400 * timeRatio));
        player.score += points;
        
        // Give drawer some points too
        const drawer = room.players.get(room.drawerUid!);
        if (drawer) {
          drawer.score += Math.floor(points * 0.2); // Drawer gets 20% of guesser's points
        }

        socket.emit("correctAnswer", { score: points });
        io.to(roomCode).emit("playerAnswered", {
          uid: player.uid,
          username: player.username,
          score: player.score
        });
        
        checkTurnEndEarly(io, room);
      }
    });

    socket.on("disconnect", () => {
      const roomCode = socket.data.roomCode as string | undefined;
      const uid = socket.data.uid as string | undefined;
      if (roomCode && uid) {
        const room = getRoom(roomCode);
        const oldHost = room?.hostUid;
        
        disconnectPlayer(roomCode, socket.id);
        socket.to(roomCode).emit("playerDisconnected", { uid });
        
        if (room && room.hostUid !== oldHost) {
          io.to(roomCode).emit("hostChanged", { hostUid: room.hostUid });
        }
      }
    });
  });
}

function serialize(p: Player) {
  return {
    uid: p.uid,
    username: p.username,
    avatar: p.avatar,
    hasAnswered: p.hasAnswered,
    score: p.score,
    connected: p.connected,
  };
}
