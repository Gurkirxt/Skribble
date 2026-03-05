import type { Room, RoomConfig, Player } from "./types.js";

const rooms = new Map<string, Room>();

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
const DEFAULT_CODE_LENGTH = 6;

function generateRoomCode(length: number): string {
  let code = "";
  for (let i = 0; i < length; i++) {
    code += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
  }
  return code;
}

function generateUniqueCode(length: number = DEFAULT_CODE_LENGTH): string {
  let code = generateRoomCode(length);
  while (rooms.has(code)) {
    code = generateRoomCode(length);
  }
  return code;
}

export function createRoom(config: RoomConfig): Room {
  const code = generateUniqueCode();
  const room: Room = {
    code,
    config,
    hostUid: null,
    gameState: "waiting",
    currentRound: 1,
    turnIndex: 0,
    roundEndTime: null,
    wordChoices: [],
    players: new Map(),
    socketToUid: new Map(),
    drawerUid: null,
    currentWord: null,
    strokes: [],
    redoStack: [],
  };
  rooms.set(code, room);
  return room;
}

export function getRoom(code: string): Room | undefined {
  return rooms.get(code.toUpperCase());
}

export function getPublicRooms(): Room[] {
  return Array.from(rooms.values()).filter(
    (room) =>
      room.config.isPublic &&
      room.players.size < room.config.maxPlayers
  );
}

/**
 * Add a brand-new player (first join). Returns the room on success or
 * undefined if the room is full or doesn't exist.
 */
export function addPlayer(roomCode: string, player: Player): Room | undefined {
  const room = rooms.get(roomCode);
  if (!room) return undefined;

  const connected = Array.from(room.players.values()).filter((p) => p.connected).length;
  if (connected >= room.config.maxPlayers) return undefined;

  room.players.set(player.uid, player);
  room.socketToUid.set(player.socketId, player.uid);
  
  if (!room.hostUid) {
    room.hostUid = player.uid;
  }
  
  return room;
}

/**
 * Update the socketId for a returning player (reconnect).
 * Returns the player record with the new socketId on success.
 */
export function reconnectPlayer(
  roomCode: string,
  uid: string,
  newSocketId: string
): Player | undefined {
  const room = rooms.get(roomCode);
  if (!room) return undefined;

  const player = room.players.get(uid);
  if (!player) return undefined;

  room.socketToUid.delete(player.socketId);
  player.socketId = newSocketId;
  player.connected = true;
  room.socketToUid.set(newSocketId, uid);
  return player;
}

/**
 * Mark a player as disconnected by their socket ID.
 * Keeps the player record so they can reconnect and resume state.
 */
export function disconnectPlayer(roomCode: string, socketId: string): void {
  const room = rooms.get(roomCode);
  if (!room) return;

  const uid = room.socketToUid.get(socketId);
  if (!uid) return;

  room.socketToUid.delete(socketId);

  const player = room.players.get(uid);
  if (player) {
    player.connected = false;
    player.socketId = "";
  }

  if (room.drawerUid === uid) {
    room.drawerUid = null;
  }

  const connectedPlayers = Array.from(room.players.values()).filter((p) => p.connected);
  if (connectedPlayers.length === 0) {
    rooms.delete(roomCode);
  } else if (room.hostUid === uid) {
    // Reassign host to the oldest connected player
    const oldestPlayer = connectedPlayers.reduce((oldest, p) => 
      p.joinTime < oldest.joinTime ? p : oldest
    );
    room.hostUid = oldestPlayer.uid;
  }
}

export function getPlayerBySocket(
  room: Room,
  socketId: string
): Player | undefined {
  const uid = room.socketToUid.get(socketId);
  if (!uid) return undefined;
  return room.players.get(uid);
}

export function setDrawer(roomCode: string, uid: string): boolean {
  const room = rooms.get(roomCode);
  if (!room || !room.players.has(uid)) return false;
  room.drawerUid = uid;
  return true;
}

export function setCurrentWord(roomCode: string, word: string): boolean {
  const room = rooms.get(roomCode);
  if (!room) return false;
  room.currentWord = word;
  return true;
}
