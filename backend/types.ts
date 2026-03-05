export type PenType = "pen" | "fill" | "eraser";

export interface StrokePoint {
  x: number;
  y: number;
}

export interface Stroke {
  id: string;
  penType: PenType;
  color: string;
  size: number;
  points: StrokePoint[];
  fillTarget?: StrokePoint;
}

export interface RoomConfig {
  isPublic: boolean;
  drawTime: number;
  maxPlayers: number;
  rounds: number;
  wordChoicesCount: number;
  hintsEnabled: boolean;
}

export interface Player {
  uid: string;
  socketId: string;
  username: string;
  hasAnswered: boolean;
  score: number;
  connected: boolean;
  joinTime: number;
}

export type GameState = "waiting" | "choosing_word" | "playing" | "round_end" | "game_over";

export interface Room {
  code: string;
  config: RoomConfig;
  hostUid: string | null;
  gameState: GameState;
  currentRound: number;
  turnIndex: number;
  roundEndTime: number | null;
  wordChoices: string[];
  /** uid → Player */
  players: Map<string, Player>;
  /** socketId → uid (updated on every reconnect) */
  socketToUid: Map<string, string>;
  /** uid of the current drawer */
  drawerUid: string | null;
  currentWord: string | null;
  strokes: Stroke[];
  redoStack: Stroke[];
}
