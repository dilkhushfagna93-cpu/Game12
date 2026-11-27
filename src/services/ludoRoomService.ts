import {
  collection,
  doc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import type { LudoColor, LudoReaction, LudoRoom, LudoRoomPlayer } from '../types';
import { db, handleFirestoreError, OperationType } from './firebase';

export const LUDO_ENTRY_TABLES = [1, 5, 10, 50, 100, 500] as const;
export type LudoEntryTableFee = (typeof LUDO_ENTRY_TABLES)[number];

export function calculateLudoPrize(entryFee: number, playerCount: number): number {
  const safeEntry = Math.max(1, Math.round(Number(entryFee) || 1));
  const safePlayers = playerCount === 4 ? 4 : 2;
  // 10% platform rake: 1v1 = 1.8x entry, 4P = 3.6x entry
  return Math.max(1, Math.round(safeEntry * safePlayers * 0.9));
}

const COLOR_ORDER: LudoColor[] = ['red', 'green', 'yellow', 'blue'];
const SMART_BOT_NAMES = ['Aarav_99', 'PriyaRoy', 'VikramPro', 'KabirAce', 'Rohan77', 'AnanyaK'];

export function getNaturalReactionDelayMs(): number {
  return 1500 + Math.floor(Math.random() * 3000);
}

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }
  return out;
}

export async function createMultiplayerLudoRoom(params: {
  uid: string;
  username: string;
  maxPlayers: number;
  entryFee: number;
  gameMode?: LudoRoom['gameMode'];
  tokensToWin?: number;
}): Promise<LudoRoom> {
  const code = generateRoomCode();
  const roomId = `ludo_${code}_${Date.now().toString(36)}`;
  const resolvedMode = params.gameMode || 'classic';
  const resolvedTokensToWin = params.tokensToWin === 1 || resolvedMode === 'quick' ? 1 : 4;
  const hostPlayer: LudoRoomPlayer = {
    uid: params.uid,
    name: params.username.slice(0, 32),
    color: 'red',
    ready: true,
    connected: true,
    finishedCount: 0,
    isBot: false,
    forfeited: false,
    missedTurns: 0,
  };

  const room: LudoRoom = {
    roomId,
    code,
    hostUid: params.uid,
    hostName: params.username.slice(0, 32),
    maxPlayers: Math.min(4, Math.max(2, params.maxPlayers)),
    gameMode: resolvedMode,
    tokensToWin: resolvedTokensToWin,
    status: 'waiting',
    entryFee: Math.max(1, Math.min(100000, Math.round(Number(params.entryFee) || 1))),
    currentTurnIndex: 0,
    diceValue: 0,
    diceRolled: false,
    consecutiveSixes: 0,
    winnerUid: '',
    winnerName: '',
    playerUids: [params.uid],
    players: [hostPlayer],
    tokens: {
      red: [-1, -1, -1, -1],
      green: [-1, -1, -1, -1],
      yellow: [-1, -1, -1, -1],
      blue: [-1, -1, -1, -1],
    },
    lastMoveNote: `${params.username} created ${resolvedMode === 'quick' ? 'Quick 1-Token' : resolvedMode === 'private' ? 'Private Friends' : 'Classic'} room ${code}`,
    turnStartedAtMs: Date.now(),
    missedTurns: { red: 0, green: 0, yellow: 0, blue: 0 },
    lastReaction: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'ludoRooms', roomId), room);
    return room;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `ludoRooms/${roomId}`);
  }
}

export async function findAndJoinLudoRoomByCode(params: {
  code: string;
  uid: string;
  username: string;
  validateEntryFee?: (room: LudoRoom) => void;
}): Promise<LudoRoom> {
  const cleanCode = params.code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleanCode.length !== 6) {
    throw new Error('Room code must be 6 characters');
  }

  try {
    const q = query(
      collection(db, 'ludoRooms'),
      where('code', '==', cleanCode),
      where('status', '==', 'waiting'),
      limit(1),
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      throw new Error('No open room found with that code');
    }

    const roomDoc = snap.docs[0];
    const room = roomDoc.data() as LudoRoom;
    if (room.playerUids.includes(params.uid)) {
      return room;
    }
    if (room.playerUids.length >= room.maxPlayers) {
      throw new Error('Room is already full');
    }

    if (params.validateEntryFee) {
      params.validateEntryFee(room);
    }

    const usedColors = new Set(room.players.map((p) => p.color));
    const preferredOrder: LudoColor[] =
      room.maxPlayers === 2 ? ['red', 'yellow', 'green', 'blue'] : COLOR_ORDER;
    const assignedColor = preferredOrder.find((c) => !usedColors.has(c)) || 'green';

    const newPlayer: LudoRoomPlayer = {
      uid: params.uid,
      name: params.username.slice(0, 32),
      color: assignedColor,
      ready: false,
      connected: true,
      finishedCount: 0,
      isBot: false,
      forfeited: false,
      missedTurns: 0,
    };

    const nextUids = [...room.playerUids, params.uid];
    const nextPlayers = [...room.players, newPlayer];

    await updateDoc(doc(db, 'ludoRooms', room.roomId), {
      playerUids: nextUids,
      players: nextPlayers,
      lastMoveNote: `${params.username} joined as ${assignedColor}`,
      updatedAt: serverTimestamp(),
    });

    return {
      ...room,
      playerUids: nextUids,
      players: nextPlayers,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Room') ||
        error.message.includes('No open room') ||
        error.message.includes('balance') ||
        error.message.includes('Balance') ||
        error.message.includes('Insufficient') ||
        error.message.includes('playable'))
    ) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, 'ludoRooms');
  }
}

export async function listOpenLudoRooms(): Promise<LudoRoom[]> {
  try {
    const q = query(collection(db, 'ludoRooms'), where('status', '==', 'waiting'), limit(20));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as LudoRoom)
      .filter((r) => r.gameMode !== 'private');
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'ludoRooms');
  }
}

export async function findOrCreatePublicLudoRoom(params: {
  uid: string;
  username: string;
  maxPlayers: 2 | 4;
  entryFee: number;
  gameMode: 'quick' | 'classic';
  tokensToWin: 1 | 4;
}): Promise<{ room: LudoRoom; joinedExisting: boolean }> {
  try {
    const open = await listOpenLudoRooms();
    const match = open.find(
      (r) =>
        r.status === 'waiting' &&
        r.gameMode === params.gameMode &&
        r.maxPlayers === params.maxPlayers &&
        r.entryFee === params.entryFee &&
        (r.tokensToWin || 4) === params.tokensToWin &&
        r.playerUids.length < r.maxPlayers &&
        !r.playerUids.includes(params.uid),
    );
    if (match) {
      const joined = await findAndJoinLudoRoomByCode({
        code: match.code,
        uid: params.uid,
        username: params.username,
      });
      return { room: joined, joinedExisting: true };
    }
  } catch {
    // Fall through cleanly to creating a fresh room if listing fails transiently
  }

  const created = await createMultiplayerLudoRoom({
    uid: params.uid,
    username: params.username,
    maxPlayers: params.maxPlayers,
    entryFee: params.entryFee,
    gameMode: params.gameMode,
    tokensToWin: params.tokensToWin,
  });
  return { room: created, joinedExisting: false };
}

export function subscribeToLudoRoom(
  roomId: string,
  onData: (room: LudoRoom | null) => void,
): Unsubscribe {
  return onSnapshot(
    doc(db, 'ludoRooms', roomId),
    (snap) => {
      onData(snap.exists() ? (snap.data() as LudoRoom) : null);
    },
    (error) => {
      handleFirestoreError(error, OperationType.GET, `ludoRooms/${roomId}`);
    },
  );
}

export async function toggleLudoPlayerReady(room: LudoRoom, uid: string): Promise<void> {
  const nextPlayers = room.players.map((p) => (p.uid === uid ? { ...p, ready: !p.ready } : p));
  try {
    await updateDoc(doc(db, 'ludoRooms', room.roomId), {
      players: nextPlayers,
      lastMoveNote: 'Player readiness updated',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `ludoRooms/${room.roomId}`);
  }
}

export async function startMultiplayerLudoMatch(room: LudoRoom): Promise<void> {
  if (room.players.length < 2) {
    throw new Error('At least 2 players are required to start');
  }
  try {
    await updateDoc(doc(db, 'ludoRooms', room.roomId), {
      status: 'playing',
      turnStartedAtMs: Date.now(),
      missedTurns: { red: 0, green: 0, yellow: 0, blue: 0 },
      lastMoveNote: `Match started — ${room.players[0].name}'s turn`,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `ludoRooms/${room.roomId}`);
  }
}

export async function fillLudoRoomWithSmartBots(room: LudoRoom): Promise<void> {
  if (room.status !== 'waiting') return;
  const usedColors = new Set(room.players.map((p) => p.color));
  const preferredOrder: LudoColor[] =
    room.maxPlayers === 2 ? ['red', 'yellow', 'green', 'blue'] : COLOR_ORDER;

  const nextPlayers = [...room.players];
  const nextUids = [...room.playerUids];
  let botIdx = 0;

  while (nextPlayers.length < room.maxPlayers) {
    const color = preferredOrder.find((c) => !usedColors.has(c));
    if (!color) break;
    usedColors.add(color);
    const botUid = `bot_${color}_${Date.now().toString(36).slice(-4)}`;
    nextUids.push(botUid);
    nextPlayers.push({
      uid: botUid,
      name: SMART_BOT_NAMES[botIdx % SMART_BOT_NAMES.length],
      color,
      ready: true,
      connected: true,
      finishedCount: 0,
      isBot: true,
      forfeited: false,
      missedTurns: 0,
    });
    botIdx += 1;
  }

  try {
    await updateDoc(doc(db, 'ludoRooms', room.roomId), {
      playerUids: nextUids,
      players: nextPlayers,
      status: 'playing',
      turnStartedAtMs: Date.now(),
      missedTurns: { red: 0, green: 0, yellow: 0, blue: 0 },
      lastMoveNote: `All players matched — ${nextPlayers[0].name}'s turn`,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `ludoRooms/${room.roomId}`);
  }
}

export async function sendLudoRoomReaction(roomId: string, reaction: LudoReaction): Promise<void> {
  try {
    await updateDoc(doc(db, 'ludoRooms', roomId), {
      lastReaction: reaction,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `ludoRooms/${roomId}`);
  }
}

export async function commitLudoRoomTurnUpdate(
  roomId: string,
  patch: Partial<
    Pick<
      LudoRoom,
      | 'currentTurnIndex'
      | 'diceValue'
      | 'diceRolled'
      | 'consecutiveSixes'
      | 'tokens'
      | 'players'
      | 'status'
      | 'winnerUid'
      | 'winnerName'
      | 'turnStartedAtMs'
      | 'missedTurns'
      | 'lastReaction'
      | 'lastMoveNote'
    >
  >,
): Promise<void> {
  try {
    await updateDoc(doc(db, 'ludoRooms', roomId), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `ludoRooms/${roomId}`);
  }
}
