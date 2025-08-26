/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import Grid from "@mui/material/GridLegacy";
import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import LogoutIcon from "@mui/icons-material/Logout";
import ReplayIcon from "@mui/icons-material/Replay";
import SendIcon from "@mui/icons-material/Send";

import {
  doc,
  setDoc,
  getDoc,
  onSnapshot,
  updateDoc,
  serverTimestamp,
  runTransaction,
  FieldPath,
} from "firebase/firestore";
import { getDb, auth, ensureAnonAuth } from "@/services/firebase";
import { onAuthStateChanged } from "firebase/auth";

import type { MoveKey, RoomState } from "@/types/game";
import MoveCard from "@/components/MoveCard";

const MOVES: MoveKey[] = ["pedra", "papel", "tesoura"];

function generateRoomCode(len = 6) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++)
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

function getWinner(a: MoveKey, b: MoveKey) {
  if (a === b) return "tie" as const;
  if (
    (a === "pedra" && b === "tesoura") ||
    (a === "papel" && b === "pedra") ||
    (a === "tesoura" && b === "papel")
  )
    return "a" as const;
  return "b" as const;
}

// function usePersistentId() {
//   const [id] = useState(() => {
//     const k = "jokenpo:uid";
//     let v = localStorage.getItem(k);
//     if (!v) {
//       v =
//         typeof crypto !== "undefined" && "randomUUID" in crypto
//           ? crypto.randomUUID()
//           : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
//       localStorage.setItem(k, v);
//     }
//     return v;
//   });
//   return id;
// }

export default function Game() {
  const [uid, setUid] = useState<string | null>(null);

  const [name, setName] = useState(localStorage.getItem("jokenpo:name") || "");
  const [targetWins, setTargetWins] = useState(3);
  const [roomCode, setRoomCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [room, setRoom] = useState<RoomState | null>(null);
  const [opponentId, setOpponentId] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [myMove, setMyMove] = useState<MoveKey | null>(null);

  const [joined, setJoined] = useState(false);

  const unsubRef = useRef<() => void | undefined>(undefined);

  useEffect(() => {
    // garante um UID por aba
    ensureAnonAuth();
    const unsub = onAuthStateChanged(auth, (user) => setUid(user?.uid ?? null));
    return unsub;
  }, []);

  // Query string ?room=XXXX
  useEffect(() => {
    const url = new URL(window.location.href);
    const qRoom = url.searchParams.get("room");
    if (qRoom) setRoomCode(qRoom.toUpperCase());
  }, []);

  const roomDocRef = useMemo(() => {
    try {
      if (!roomCode) return null;
      return doc(getDb(), "rooms", roomCode);
    } catch (e: any) {
      setError(e.message);
      return null;
    }
  }, [roomCode]);

  useEffect(() => {
    if (!roomDocRef) return;
    if (unsubRef.current) unsubRef.current();
    unsubRef.current = onSnapshot(roomDocRef, async (snap) => {
      if (!snap.exists()) {
        setRoom(null);
        setOpponentId(null);
        return;
      }
      const data = snap.data() as RoomState;
      setRoom(data);

      if (data && data.players && uid) {
        const ids = Object.keys(data.players).filter((id) => id !== uid);
        setOpponentId(ids[0] || null);
        setIsOwner(data.ownerId === uid);
        const me = data.players[uid];
        setMyMove(me?.move ?? null);

        // self-heal: 2 players mas status ainda 'waiting'
        if (
          Object.keys(data.players).length >= 2 &&
          data.status === "waiting"
        ) {
          try {
            await updateDoc(roomDocRef, { status: "playing" });
          } catch {
            // ignore
          }
        }
      }
    });
    return () => unsubRef.current?.();
  }, [roomDocRef, uid]);

  useEffect(() => {
    const onUnload = () => {
      if (!roomDocRef) return;
      leaveRoom();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomDocRef]);

  async function createRoom() {
    setError(null);
    if (!uid) {
      setError("Usuário não autenticado.");
      return;
    }

    try {
      const db = getDb();

      let code = "";
      let ref;
      do {
        code = generateRoomCode();
        ref = doc(db, "rooms", code);
      } while ((await getDoc(ref)).exists());

      setRoomCode(code);
      setJoined(true);
      await setDoc(ref, {
        createdAt: serverTimestamp(),
        ownerId: uid,
        targetWins,
        status: "waiting",
        round: 1,
        players: {
          [uid]: {
            name: name.trim() || "Jogador",
            score: 0,
            joinedAt: serverTimestamp(),
            move: null,
          },
        },
        lastResult: null,
        resultVersion: 0,
      });

      const url = new URL(window.location.href);
      url.searchParams.set("room", code);
      window.history.replaceState(null, "", url.toString());
    } catch (e: any) {
      console.error("createRoom error:", e);
      setError(e.message);
    }
  }

  async function joinRoom() {
    setError(null);
    if (!uid || !roomCode) return;

    try {
      const ref = doc(getDb(), "rooms", roomCode);
      const snap = await getDoc(ref);
      if (!snap.exists()) throw new Error("Sala não encontrada.");

      const data = snap.data() as RoomState;

      const players = data.players || {};
      const alreadyIn = !!players[uid];
      const capacityOk = Object.keys(players).length < 2 || alreadyIn;
      if (!capacityOk) throw new Error("Sala cheia (máx. 2 jogadores).");

      // grava SOMENTE players.<uid> (sem tocar em outros campos do doc)
      await setDoc(
        ref,
        {
          players: {
            [uid]: {
              name: name.trim() || "Convidado",
              score: alreadyIn ? players[uid].score ?? 0 : 0,
              joinedAt: serverTimestamp(),
              move: null,
            },
          },
        },
        { mergeFields: [new FieldPath("players", uid)] }
      );

      // se agora há 2 jogadores, muda status para 'playing' (apenas esse campo)
      const fresh = (await getDoc(ref)).data() as RoomState | undefined;
      const count = fresh ? Object.keys(fresh.players || {}).length : 0;
      if (count >= 2 && fresh?.status !== "playing") {
        await updateDoc(ref, { status: "playing" });
      }

      const url = new URL(window.location.href);
      url.searchParams.set("room", roomCode);
      window.history.replaceState(null, "", url.toString());

      setJoined(true);
    } catch (e: any) {
      console.error("joinRoom error:", e);
      setError("Erro ao entrar na sala => " + e.message);
    }
  }

  async function leaveRoom() {
    if (!uid || !roomDocRef) return;
    try {
      if (!roomDocRef) return;
      await runTransaction(getDb(), async (tx) => {
        const snap = await tx.get(roomDocRef);
        if (!snap.exists()) return;
        const data = snap.data() as RoomState;
        const players = { ...(data.players || {}) };
        delete players[uid];
        if (Object.keys(players).length === 0) {
          tx.delete(roomDocRef);
          return;
        }
        let ownerId = data.ownerId;
        if (ownerId === uid) ownerId = Object.keys(players)[0];
        tx.update(roomDocRef, {
          players,
          ownerId,
          status: Object.keys(players).length === 1 ? "waiting" : data.status,
        });
      });
      setRoom(null);
      setOpponentId(null);
      setRoomCode("");
      setJoined(false);
      const url = new URL(window.location.href);
      url.searchParams.delete("room");
      window.history.replaceState(null, "", url.toString());
    } catch {
      // ignore
    }
  }

  async function chooseMove(move: MoveKey) {
    if (!uid || !roomDocRef || !room) return;
    if (!roomDocRef || !room) return;
    if (room.status !== "playing") return;
    setMyMove(move);
    try {
      await updateDoc(roomDocRef, { [`players.${uid}.move`]: move });
      await maybeComputeRound();
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function maybeComputeRound() {
    if (!roomDocRef) return;
    await runTransaction(getDb(), async (tx) => {
      const snap = await tx.get(roomDocRef);
      if (!snap.exists()) return;
      const data = snap.data() as RoomState;
      const ids = Object.keys(data.players || {});
      if (ids.length < 2) return;
      const [aId, bId] = [data.ownerId, ids.find((i) => i !== data.ownerId)!];
      const a = data.players[aId];
      const b = data.players[bId];
      if (!a?.move || !b?.move) return;
      const cur = data.resultVersion || 0;
      const outcome = getWinner(a.move, b.move);
      let aScore = a.score;
      let bScore = b.score;
      if (outcome === "a") aScore += 1;
      if (outcome === "b") bScore += 1;
      const finished = aScore >= data.targetWins || bScore >= data.targetWins;
      tx.update(roomDocRef, {
        [`players.${aId}.score`]: aScore,
        [`players.${bId}.score`]: bScore,
        lastResult: { aMove: a.move, bMove: b.move, winner: outcome },
        round: data.round + 1,
        status: finished ? "finished" : "playing",
        resultVersion: cur + 1,
        [`players.${aId}.move`]: null,
        [`players.${bId}.move`]: null,
      });
    });
  }

  async function rematch() {
    if (!roomDocRef || !room) return;
    try {
      const ids = Object.keys(room.players || {});
      for (const id of ids) {
        await updateDoc(roomDocRef, {
          [`players.${id}.score`]: 0,
          [`players.${id}.move`]: null,
          round: 1,
          status: "playing",
          lastResult: null,
        });
      }
    } catch (e: any) {
      setError(e.message);
    }
  }

  function copyInvite() {
    if (!roomCode) return;
    // const url = new URL(window.location.href);
    // url.searchParams.set("room", roomCode);
    // navigator.clipboard.writeText(url.toString());
    navigator.clipboard.writeText(roomCode);
  }

  const me = room?.players?.[uid!];
  const opp = opponentId ? room?.players?.[opponentId] : null;
  const showMoves = !!room?.lastResult && room.lastResult.winner !== null;

  if (!uid) {
    return <Alert severity="info">Iniciando sessão anônima…</Alert>;
  }

  return (
    <Stack spacing={2}>
      <Typography variant="h4" fontWeight={800}>
        Jokenpo Online
      </Typography>
      <Typography color="text.secondary">
        Crie ou entre em uma sala e jogue 1x1 em tempo real.
      </Typography>

      {/* Aviso de env */}
      {(() => {
        try {
          getDb();
          return null;
        } catch (e: any) {
          return <Alert severity="warning">{e.message}</Alert>;
        }
      })()}

      {/* Perfil e meta */}
      <Grid container>
        <Grid
          item
          xs={12}
          md={5}
          sx={{ pr: { xs: 0, md: 1 } }}
          style={{ marginBottom: 10 }}
        >
          <TextField
            size="small"
            fullWidth
            label="Seu nome"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              localStorage.setItem("jokenpo:name", e.target.value);
            }}
          />
        </Grid>
        <Grid item xs={12} md={2}>
          <TextField
            size="small"
            fullWidth
            type="number"
            label="Vitórias para vencer"
            value={targetWins}
            onChange={(e) =>
              setTargetWins(Math.max(1, Number(e.target.value || 1)))
            }
            disabled={!!room}
          />
        </Grid>
      </Grid>

      {/* Criar/Entrar */}
      {!joined && (
        <Grid container>
          <Grid item xs={12} md={2}>
            <Button
              onClick={createRoom}
              variant="contained"
              fullWidth
              size="large"
            >
              Criar sala
            </Button>
          </Grid>
          <Grid item xs={12} md={1}>
            <Typography
              variant="body2"
              align="center"
              sx={{ lineHeight: "48px" }}
            >
              ou
            </Typography>
          </Grid>
          <Grid item xs={6} md={2} style={{ paddingRight: 10 }}>
            <TextField
              fullWidth
              size="small"
              label="Código da sala"
              value={roomCode}
              onChange={(e) => {
                setRoomCode(e.target.value.toUpperCase());
                setJoined(false);
              }}
              placeholder="H7Q3ZK"
            />
          </Grid>
          <Grid item xs={6} md={2}>
            <Button
              onClick={joinRoom}
              variant="outlined"
              fullWidth
              size="large"
              disabled={!name.trim() || roomCode.length !== 6 || joined}
              endIcon={<SendIcon />}
            >
              Entrar
            </Button>
          </Grid>
        </Grid>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      {room && joined && (
        <Stack>
          <Stack
            direction="row"
            alignItems="center"
            spacing={1}
            style={{ marginTop: -10 }}
          >
            <Typography variant="body2">Sala:</Typography>
            <Chip
              label={roomCode}
              size="small"
              sx={{ fontWeight: 700, letterSpacing: 1 }}
            />
            <Tooltip title="Copiar link de convite">
              <IconButton onClick={copyInvite}>
                <ContentCopyIcon />
              </IconButton>
            </Tooltip>
            <Box sx={{ flex: 1 }} />
            <Tooltip
              title={
                room.status !== "finished"
                  ? "Disponível após fim do jogo"
                  : "Recomeçar partida"
              }
            >
              <span>
                <Button
                  startIcon={<ReplayIcon />}
                  onClick={rematch}
                  disabled={room.status !== "finished"}
                >
                  Rematch
                </Button>
              </span>
            </Tooltip>
            <Button
              color="inherit"
              startIcon={<LogoutIcon />}
              onClick={leaveRoom}
            >
              Sair
            </Button>
          </Stack>

          <Grid container spacing={1}>
            <Grid item xs={12} md={6}>
              <Box
                sx={{
                  p: 2,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 2,
                }}
              >
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                >
                  <Box>
                    <Typography variant="overline" color="text.secondary">
                      Você
                    </Typography>
                    <Typography variant="h6" fontWeight={700}>
                      {me?.name || "Você"}
                    </Typography>
                  </Box>
                  <Chip
                    label={me?.score ?? 0}
                    color="primary"
                    variant="outlined"
                    sx={{ fontWeight: 700 }}
                  />
                </Stack>
                <Typography variant="body2" color="text.secondary">
                  {isOwner ? "(dono)" : "(convidado)"}
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12} md={6} style={{ marginBottom: 10 }}>
              <Box
                sx={{
                  p: 2,
                  border: "1px solid",
                  borderColor: "divider",
                  borderRadius: 2,
                }}
              >
                <Stack
                  direction="row"
                  alignItems="center"
                  justifyContent="space-between"
                >
                  <Box>
                    <Typography variant="overline" color="text.secondary">
                      Oponente
                    </Typography>
                    <Typography variant="h6" fontWeight={700}>
                      {opp?.name || "Aguardando..."}
                    </Typography>
                  </Box>
                  <Chip
                    label={opp?.score ?? 0}
                    variant="outlined"
                    sx={{ fontWeight: 700 }}
                  />
                </Stack>
                {opponentId && (
                  <Typography variant="body2" color="text.secondary">
                    {!isOwner ? "(dono)" : "(convidado)"}
                  </Typography>
                )}
                <Typography variant="body2" color="text.secondary">
                  {!opponentId ? "aguardando entrar" : ""}
                </Typography>
              </Box>
            </Grid>
          </Grid>

          <Box
            sx={{
              p: 2,
              border: "1px dashed",
              borderColor: "divider",
              borderRadius: 2,
            }}
            style={{ marginBottom: 10 }}
          >
            <Stack
              direction="row"
              divider={<Divider orientation="vertical" flexItem />}
              spacing={4}
            >
              <Box>
                <Typography variant="overline" color="text.secondary">
                  Rodada
                </Typography>
                <Typography fontWeight={700}>{room.round}</Typography>
              </Box>
              <Box>
                <Typography variant="overline" color="text.secondary">
                  Meta
                </Typography>
                <Typography fontWeight={700}>
                  {room.targetWins} vitórias
                </Typography>
              </Box>
              <Box>
                <Typography variant="overline" color="text.secondary">
                  Status
                </Typography>
                <Typography fontWeight={700}>
                  {room.status === "waiting" && "Aguardando jogador"}
                  {room.status === "playing" && "Jogando"}
                  {room.status === "finished" && "Fim de jogo"}
                </Typography>
              </Box>
            </Stack>

            {room.lastResult && (
              <Box sx={{ mt: 2 }}>
                <Typography color="text.secondary">
                  Resultado da última rodada:
                </Typography>
                <Typography variant="h6" sx={{ mt: 0.5 }}>
                  {room.lastResult.winner === "tie" && "Empate"}
                  {room.lastResult.winner === "a" &&
                    (isOwner ? "Você venceu" : "Oponente venceu")}
                  {room.lastResult.winner === "b" &&
                    (isOwner ? "Oponente venceu" : "Você venceu")}
                </Typography>
                {showMoves && (
                  <Stack direction={{ xs: "column", sm: "row" }} sx={{ mt: 1 }}>
                    <Chip
                      label={`Seu lance: ${
                        (isOwner
                          ? room.lastResult.aMove
                          : room.lastResult.bMove) || "-"
                      }`}
                    />
                    <Chip
                      label={`Oponente: ${
                        (isOwner
                          ? room.lastResult.bMove
                          : room.lastResult.aMove) || "-"
                      }`}
                    />
                  </Stack>
                )}
              </Box>
            )}
          </Box>

          <Box
            sx={{
              p: 2,
              border: "1px solid",
              borderColor: "divider",
              borderRadius: 2,
            }}
          >
            {room.status !== "playing" ? (
              <Typography align="center" color="text.secondary">
                {room.status === "waiting" && "Aguardando oponente entrar..."}
                {room.status === "finished" &&
                  "Partida encerrada. Clique em Rematch para recomeçar."}
              </Typography>
            ) : !opponentId ? (
              <Typography align="center" color="text.secondary">
                Compartilhe o link para alguém entrar.
              </Typography>
            ) : (
              <>
                <Typography align="center" color="text.secondary">
                  Escolha seu lance
                </Typography>
                <Grid container sx={{ mt: 1 }}>
                  {MOVES.map((m) => (
                    <Grid item xs={12} sm={4} key={m}>
                      <MoveCard
                        move={m}
                        selected={myMove === m}
                        onClick={() => chooseMove(m)}
                      />
                    </Grid>
                  ))}
                </Grid>
                <Typography
                  align="center"
                  color="text.secondary"
                  sx={{ mt: 1 }}
                >
                  {myMove ? "Lance enviado. Aguardando o oponente..." : " "}
                </Typography>
              </>
            )}
          </Box>
        </Stack>
      )}
    </Stack>
  );
}
