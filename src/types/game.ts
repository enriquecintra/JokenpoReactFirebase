/* eslint-disable @typescript-eslint/no-explicit-any */
export type MoveKey = "pedra" | "papel" | "tesoura";

export interface Player {
  name: string;
  score: number;
  move?: MoveKey | null;
  joinedAt: any;
}

export interface RoomState {
  createdAt: any;
  ownerId: string;
  targetWins: number;
  status: "waiting" | "playing" | "finished";
  round: number;
  players: Record<string, Player>;
  lastResult?: {
    aMove?: MoveKey;
    bMove?: MoveKey;
    winner: "a" | "b" | "tie" | null;
  } | null;
  resultVersion?: number;
}
