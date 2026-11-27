import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getTeenPattiTableTier } from '../games/teen-patti/teenPattiLogic';
import type {
  PlayingCard,
  TeenPattiBootAmount,
  TeenPattiReaction,
  TeenPattiRoom,
  TeenPattiSeatPlayer,
} from '../types';
import { db, handleFirestoreError, OperationType } from './firebase';

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const SMART_BOT_HANDLES = [
  'Aarav_99',
  'PriyaRoy',
  'VikramPro',
  'KabirAce',
  'Rohan77',
  'AnanyaK',
  'MeeraStar',
  'DevKing',
];

export function getNaturalReactionDelayMs(): number {
  return 2000 + Math.floor(Math.random() * 2001);
}

function generateRoomCode(): string {
  let out = '';
  for (let i = 0; i < 6; i++) {
    out += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return out;
}

export async function requestServerTeenPattiDeal(
  seatCount: number,
  bootAmount: number,
): Promise<{
  roundId: string;
  serverSeedHash: string;
  hands: PlayingCard[][];
}> {
  const res = await fetch('/api/games/teen-patti/deal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ seatCount, bootAmount }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error || 'Failed to deal Teen Patti hand');
  }
  return {
    roundId: String(data.roundId),
    serverSeedHash: String(data.serverSeedHash),
    hands: data.hands as PlayingCard[][],
  };
}

export async function createTeenPattiRoom(params: {
  hostUid: string;
  hostName: string;
  bootAmount: TeenPattiBootAmount;
  isPrivate: boolean;
  maxPlayers?: number;
}): Promise<TeenPattiRoom> {
  const tier = getTeenPattiTableTier(params.bootAmount);
  const roomId = `tp_room_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const code = generateRoomCode();
  const safeHostName = params.hostName.trim().slice(0, 32) || 'Player';
  const maxPlayers = Math.max(2, Math.min(5, Math.round(params.maxPlayers ?? 5)));

  const room: TeenPattiRoom = {
    roomId,
    code,
    hostUid: params.hostUid,
    hostName: safeHostName,
    maxPlayers,
    isPrivate: Boolean(params.isPrivate),
    bootAmount: tier.boot,
    chaalLimit: tier.chaalLimit,
    potLimit: tier.potLimit,
    status: 'waiting',
    roundId: '',
    handNumber: 0,
    dealerIndex: 0,
    currentTurnIndex: 0,
    currentStake: tier.boot,
    pot: 0,
    winnerUid: '',
    winnerName: '',
    winnerHandLabel: '',
    winnerPayout: 0,
    serverSeedHash: '',
    serverSeed: '',
    playerUids: [params.hostUid],
    players: [
      {
        uid: params.hostUid,
        name: safeHostName,
        seatIndex: 0,
        isBot: false,
        status: 'waiting',
        isSeen: false,
        totalBet: 0,
        lastAction: 'Seated',
        cards: [],
      },
    ],
    sideShowRequest: null,
    lastReaction: null,
    lastActionNote: `${safeHostName} opened a ₹${tier.boot} Boot table`,
    turnStartedAtMs: Date.now(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  try {
    await setDoc(doc(db, 'teenPattiRooms', roomId), room);
    return room;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `teenPattiRooms/${roomId}`);
  }
}

export async function listOpenTeenPattiRooms(bootAmount?: TeenPattiBootAmount): Promise<TeenPattiRoom[]> {
  try {
    const q = query(collection(db, 'teenPattiRooms'), where('status', '==', 'waiting'));
    const snap = await getDocs(q);
    return snap.docs
      .map((d) => d.data() as TeenPattiRoom)
      .filter((r) => {
        if (r.isPrivate) return false;
        if (r.playerUids.length >= r.maxPlayers) return false;
        if (bootAmount !== undefined && r.bootAmount !== bootAmount) return false;
        return true;
      });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'teenPattiRooms');
  }
}

export async function joinTeenPattiRoomById(params: {
  roomId: string;
  uid: string;
  username: string;
  validateBootBalance?: (bootAmount: number) => void;
}): Promise<TeenPattiRoom> {
  const roomRef = doc(db, 'teenPattiRooms', params.roomId);
  const safeName = params.username.trim().slice(0, 32) || 'Player';

  try {
    return await runTransaction(db, async (tx) => {
      const snap = await tx.get(roomRef);
      if (!snap.exists()) throw new Error('Table not found');
      const room = snap.data() as TeenPattiRoom;

      if (room.playerUids.includes(params.uid)) {
        return room;
      }
      if (params.validateBootBalance) {
        params.validateBootBalance(room.bootAmount);
      }
      if (room.status !== 'waiting') {
        throw new Error('This table has already started a hand.');
      }
      if (room.playerUids.length >= room.maxPlayers) {
        throw new Error('This table is full (5/5 players).');
      }

      const nextSeatIndex = room.players.length;
      const nextPlayers: TeenPattiSeatPlayer[] = [
        ...room.players,
        {
          uid: params.uid,
          name: safeName,
          seatIndex: nextSeatIndex,
          isBot: false,
          status: 'waiting',
          isSeen: false,
          totalBet: 0,
          lastAction: 'Joined',
          cards: [],
        },
      ];
      const nextUids = [...room.playerUids, params.uid];

      tx.update(roomRef, {
        playerUids: nextUids,
        players: nextPlayers,
        lastActionNote: `${safeName} joined Seat ${nextSeatIndex + 1}`,
        updatedAt: serverTimestamp(),
      });

      return {
        ...room,
        playerUids: nextUids,
        players: nextPlayers,
      };
    });
  } catch (error) {
    if (error instanceof Error && !error.message.includes('Firebase')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.WRITE, `teenPattiRooms/${params.roomId}`);
  }
}

export async function findAndJoinTeenPattiRoomByCode(params: {
  code: string;
  uid: string;
  username: string;
  validateBootBalance?: (bootAmount: number) => void;
}): Promise<TeenPattiRoom> {
  const cleanCode = params.code.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (cleanCode.length < 6) {
    throw new Error('Enter a valid 6-character Private Table code.');
  }

  try {
    const q = query(
      collection(db, 'teenPattiRooms'),
      where('code', '==', cleanCode),
      where('status', '==', 'waiting'),
    );
    const snap = await getDocs(q);
    if (snap.empty) {
      throw new Error('No open Teen Patti table found with that code.');
    }
    const target = snap.docs[0].data() as TeenPattiRoom;
    return await joinTeenPattiRoomById({
      roomId: target.roomId,
      uid: params.uid,
      username: params.username,
      validateBootBalance: params.validateBootBalance,
    });
  } catch (error) {
    if (error instanceof Error && !error.message.includes('Firebase')) {
      throw error;
    }
    handleFirestoreError(error, OperationType.LIST, 'teenPattiRooms');
  }
}

export async function findOrCreatePublicTeenPattiRoom(params: {
  uid: string;
  username: string;
  bootAmount: TeenPattiBootAmount;
}): Promise<TeenPattiRoom> {
  const openRooms = await listOpenTeenPattiRooms(params.bootAmount);
  const candidate = openRooms.find(
    (r) => !r.playerUids.includes(params.uid) && r.playerUids.length < r.maxPlayers,
  );
  if (candidate) {
    try {
      return await joinTeenPattiRoomById({
        roomId: candidate.roomId,
        uid: params.uid,
        username: params.username,
      });
    } catch {
      // Fall through to create a fresh room if table filled up concurrently
    }
  }
  return await createTeenPattiRoom({
    hostUid: params.uid,
    hostName: params.username,
    bootAmount: params.bootAmount,
    isPrivate: false,
    maxPlayers: 5,
  });
}

export function subscribeToTeenPattiRoom(
  roomId: string,
  onData: (room: TeenPattiRoom | null) => void,
  onError?: (err: unknown) => void,
): () => void {
  return onSnapshot(
    doc(db, 'teenPattiRooms', roomId),
    (snap) => {
      if (!snap.exists()) {
        onData(null);
        return;
      }
      onData(snap.data() as TeenPattiRoom);
    },
    (err) => {
      if (onError) onError(err);
    },
  );
}

/**
 * Fill remaining seats with realistic smart players (up to targetSeatCount, default 4 total)
 * and deal the opening server-authoritative hand cleanly.
 */
export async function fillTeenPattiRoomAndDeal(params: {
  room: TeenPattiRoom;
  targetSeats?: number;
}): Promise<void> {
  const { room } = params;
  const desiredSeats = Math.max(
    room.players.length,
    Math.min(room.maxPlayers, params.targetSeats ?? 4),
  );

  const usedNames = new Set(room.players.map((p) => p.name.toLowerCase()));
  const pool = [...SMART_BOT_HANDLES].sort(() => Math.random() - 0.5);

  const nextPlayers: TeenPattiSeatPlayer[] = room.players.map((p, idx) => ({
    ...p,
    seatIndex: idx,
    status: 'active',
    isSeen: false,
    totalBet: room.bootAmount,
    lastAction: `Boot ₹${room.bootAmount}`,
    cards: [],
    handLabel: '',
  }));
  const nextUids = [...room.playerUids];

  let botIdx = 0;
  while (nextPlayers.length < desiredSeats) {
    const candidateName =
      pool.find((n) => !usedNames.has(n.toLowerCase())) || `Player_${100 + botIdx}`;
    usedNames.add(candidateName.toLowerCase());
    const botUid = `bot_tp_${Date.now()}_${botIdx}_${Math.random().toString(36).slice(2, 5)}`;
    nextUids.push(botUid);
    nextPlayers.push({
      uid: botUid,
      name: candidateName,
      seatIndex: nextPlayers.length,
      isBot: true,
      status: 'active',
      isSeen: false,
      totalBet: room.bootAmount,
      lastAction: `Boot ₹${room.bootAmount}`,
      cards: [],
      handLabel: '',
    });
    botIdx += 1;
  }

  const dealt = await requestServerTeenPattiDeal(nextPlayers.length, room.bootAmount);
  const dealtPlayers = nextPlayers.map((p, idx) => ({
    ...p,
    cards: dealt.hands[idx] || [],
  }));

  const dealerIndex = 0;
  const firstTurnIndex = dealtPlayers.length > 1 ? 1 : 0;
  const openingPot = dealtPlayers.length * room.bootAmount;

  try {
    await updateDoc(doc(db, 'teenPattiRooms', room.roomId), {
      playerUids: nextUids,
      players: dealtPlayers,
      status: 'playing',
      roundId: dealt.roundId,
      handNumber: (room.handNumber || 0) + 1,
      dealerIndex,
      currentTurnIndex: firstTurnIndex,
      currentStake: room.bootAmount,
      pot: openingPot,
      winnerUid: '',
      winnerName: '',
      winnerHandLabel: '',
      winnerPayout: 0,
      serverSeedHash: dealt.serverSeedHash,
      serverSeed: '',
      sideShowRequest: null,
      lastActionNote: `Hand #${(room.handNumber || 0) + 1} dealt · Boot ₹${room.bootAmount} collected`,
      turnStartedAtMs: Date.now(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `teenPattiRooms/${room.roomId}`);
  }
}

export async function dealNextTeenPattiHand(room: TeenPattiRoom): Promise<void> {
  const nextHandNum = (room.handNumber || 0) + 1;
  const dealt = await requestServerTeenPattiDeal(room.players.length, room.bootAmount);
  const nextDealer = (room.dealerIndex + 1) % room.players.length;
  const firstTurn = (nextDealer + 1) % room.players.length;

  const dealtPlayers: TeenPattiSeatPlayer[] = room.players.map((p, idx) => ({
    ...p,
    seatIndex: idx,
    status: 'active',
    isSeen: false,
    totalBet: room.bootAmount,
    lastAction: `Boot ₹${room.bootAmount}`,
    cards: dealt.hands[idx] || [],
    handLabel: '',
  }));

  const openingPot = dealtPlayers.length * room.bootAmount;

  try {
    await updateDoc(doc(db, 'teenPattiRooms', room.roomId), {
      players: dealtPlayers,
      status: 'playing',
      roundId: dealt.roundId,
      handNumber: nextHandNum,
      dealerIndex: nextDealer,
      currentTurnIndex: firstTurn,
      currentStake: room.bootAmount,
      pot: openingPot,
      winnerUid: '',
      winnerName: '',
      winnerHandLabel: '',
      winnerPayout: 0,
      serverSeedHash: dealt.serverSeedHash,
      serverSeed: '',
      sideShowRequest: null,
      lastActionNote: `Hand #${nextHandNum} dealt · Boot ₹${room.bootAmount} collected`,
      turnStartedAtMs: Date.now(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `teenPattiRooms/${room.roomId}`);
  }
}

export async function commitTeenPattiRoomUpdate(
  roomId: string,
  patch: Partial<
    Pick<
      TeenPattiRoom,
      | 'players'
      | 'status'
      | 'currentTurnIndex'
      | 'currentStake'
      | 'pot'
      | 'winnerUid'
      | 'winnerName'
      | 'winnerHandLabel'
      | 'winnerPayout'
      | 'serverSeedHash'
      | 'serverSeed'
      | 'sideShowRequest'
      | 'lastActionNote'
      | 'turnStartedAtMs'
    >
  >,
): Promise<void> {
  try {
    await updateDoc(doc(db, 'teenPattiRooms', roomId), {
      ...patch,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `teenPattiRooms/${roomId}`);
  }
}

export async function sendTeenPattiReaction(
  roomId: string,
  reaction: Omit<TeenPattiReaction, 'id' | 'createdAtMs'>,
): Promise<void> {
  try {
    await updateDoc(doc(db, 'teenPattiRooms', roomId), {
      lastReaction: {
        ...reaction,
        id: `rx_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        createdAtMs: Date.now(),
      },
      updatedAt: serverTimestamp(),
    });
  } catch {
    // Non-blocking chat/emoji reaction
  }
}
