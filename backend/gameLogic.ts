import type { Server } from "socket.io";
import type { Room } from "./types.js";
import { getRandomWords } from "./words.js";

const roomTimers = new Map<string, NodeJS.Timeout>();
const hintTimers = new Map<string, NodeJS.Timeout[]>();

function clearRoomTimers(roomCode: string) {
  const timer = roomTimers.get(roomCode);
  if (timer) clearTimeout(timer);
  roomTimers.delete(roomCode);

  const hints = hintTimers.get(roomCode);
  if (hints) {
    hints.forEach(clearTimeout);
  }
  hintTimers.delete(roomCode);
}

export function startGame(io: Server, room: Room) {
  room.gameState = "choosing_word";
  room.currentRound = 1;
  room.turnIndex = 0;
  
  // Reset player scores
  for (const player of room.players.values()) {
    player.score = 0;
    player.hasAnswered = false;
  }
  
  startTurn(io, room);
}

export function startTurn(io: Server, room: Room) {
  clearRoomTimers(room.code);
  
  const players = Array.from(room.players.values());
  if (players.length === 0) return;

  if (room.turnIndex >= players.length) {
    room.turnIndex = 0;
    room.currentRound++;
    
    if (room.currentRound > room.config.rounds) {
      endGame(io, room);
      return;
    }
  }

  const drawer = players[room.turnIndex];
  if (!drawer) return;
  
  room.drawerUid = drawer.uid;
  room.gameState = "choosing_word";
  room.currentWord = null;
  room.strokes = [];
  room.redoStack = [];
  room.wordChoices = getRandomWords(room.config.wordChoicesCount || 3);

  for (const player of players) {
    player.hasAnswered = false;
  }

  // Send word choices ONLY to the drawer
  io.to(drawer.socketId).emit("wordChoices", { choices: room.wordChoices });
  
  // Notify everyone else that drawer is choosing
  io.to(room.code).emit("turnStart", { 
    drawerUid: drawer.uid, 
    round: room.currentRound,
    turn: room.turnIndex + 1
  });

  // 15 seconds to choose a word
  const timer = setTimeout(() => {
    // Auto-pick first word if they didn't choose
    if (room.gameState === "choosing_word" && room.wordChoices.length > 0) {
      wordChosen(io, room, room.wordChoices[0]!);
    }
  }, 15000);
  
  roomTimers.set(room.code, timer);
}

export function wordChosen(io: Server, room: Room, word: string) {
  clearRoomTimers(room.code);
  
  room.currentWord = word;
  room.gameState = "playing";
  room.roundEndTime = Date.now() + (room.config.drawTime * 1000);
  
  const wordLength = word.length;
  const blanks = word.replace(/[a-zA-Z0-9]/g, "_");

  // Send the actual word to the drawer
  const drawer = room.players.get(room.drawerUid!);
  if (drawer) {
    io.to(drawer.socketId).emit("wordChosen", { word });
  }

  // Send blanks to everyone else
  for (const player of room.players.values()) {
    if (player.uid !== room.drawerUid) {
      io.to(player.socketId).emit("wordChosen", { word: blanks, length: wordLength });
    }
  }

  // Set up turn end timer
  const timer = setTimeout(() => {
    endTurn(io, room);
  }, room.config.drawTime * 1000);
  roomTimers.set(room.code, timer);

  // Set up hints if enabled
  if (room.config.hintsEnabled) {
    setupHints(io, room, word);
  }
}

function setupHints(io: Server, room: Room, word: string) {
  const hintInterval = (room.config.drawTime * 1000) / word.length;
  const timers: NodeJS.Timeout[] = [];
  let revealed = Array(word.length).fill("_");
  
  // Don't reveal spaces
  for (let i = 0; i < word.length; i++) {
    if (word[i] === " ") revealed[i] = " ";
  }

  const unrevealedIndices = word.split('').map((_, i) => i).filter(i => word[i] !== " ");
  // Shuffle indices
  unrevealedIndices.sort(() => Math.random() - 0.5);

  // Reveal up to length/2 letters
  const maxHints = Math.floor(word.length / 2);

  for (let i = 0; i < maxHints; i++) {
    const timer = setTimeout(() => {
      if (room.gameState !== "playing") return;
      
      const idx = unrevealedIndices[i];
      if (idx === undefined) return;
      
      revealed[idx] = word[idx] as string;
      
      for (const player of room.players.values()) {
        if (player.uid !== room.drawerUid && !player.hasAnswered) {
          io.to(player.socketId).emit("hint", { hint: revealed.join("") });
        }
      }
    }, hintInterval * (i + 1));
    timers.push(timer);
  }
  
  hintTimers.set(room.code, timers);
}

export function checkTurnEndEarly(io: Server, room: Room) {
  if (room.gameState !== "playing") return;

  const players = Array.from(room.players.values());
  const nonDrawers = players.filter(p => p.uid !== room.drawerUid && p.connected);
  
  if (nonDrawers.length > 0 && nonDrawers.every(p => p.hasAnswered)) {
    endTurn(io, room);
  }
}

export function endTurn(io: Server, room: Room) {
  clearRoomTimers(room.code);
  room.gameState = "round_end";
  
  const scores = Array.from(room.players.values()).map(p => ({
    uid: p.uid,
    score: p.score
  }));

  io.to(room.code).emit("turnEnd", {
    word: room.currentWord,
    scores
  });

  room.turnIndex++;

  // 5 seconds between turns
  const timer = setTimeout(() => {
    startTurn(io, room);
  }, 5000);
  roomTimers.set(room.code, timer);
}

export function endGame(io: Server, room: Room) {
  clearRoomTimers(room.code);
  room.gameState = "game_over";
  
  const finalScores = Array.from(room.players.values())
    .map(p => ({ uid: p.uid, score: p.score, username: p.username }))
    .sort((a, b) => b.score - a.score);

  io.to(room.code).emit("gameOver", { scores: finalScores });
}
