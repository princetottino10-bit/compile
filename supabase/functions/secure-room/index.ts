import { createClient } from "npm:@supabase/supabase-js@2";
import "../_shared/engine.js";
import cards from "../_shared/cards.json" with { type: "json" };
import effects from "../_shared/effects.json" with { type: "json" };

const Engine = (globalThis as any).CompileEngine;
Engine.init(cards, effects);
Engine.setTrace(true);

const URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });
const allowed = (Deno.env.get("ALLOWED_ORIGINS") ||
  "https://princetottino10-bit.github.io,http://localhost:8765,http://127.0.0.1:8765")
  .split(",").map((x) => x.trim());

function cors(req: Request) {
  const origin = req.headers.get("origin") || "";
  return {
    "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

function json(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status, headers: { ...cors(req), "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function fail(req: Request, message: string, status = 400) {
  return json(req, { error: message }, status);
}

function cleanName(value: unknown) {
  return String(value || "").trim().replace(/[<>\u0000-\u001f]/g, "").slice(0, 20);
}

function cleanCode(value: unknown) {
  return String(value || "").toUpperCase().replace(/[^A-Z2-9]/g, "").slice(0, 6);
}

function cleanTitle(value: unknown) {
  return String(value || "対戦募集").trim().replace(/[<>\u0000-\u001f]/g, "").slice(0, 30) || "対戦募集";
}

function bytesToBase64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes));
}

function base64ToBytes(value: string) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

async function passwordDigest(password: string, salt: Uint8Array) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 120_000 }, key, 256);
  return bytesToBase64(new Uint8Array(bits));
}

async function roomPassword(password: unknown) {
  const value = String(password || "");
  if (!value) return { salt: null, hash: null };
  if (value.length < 4 || value.length > 40) throw new Error("パスワードは4〜40文字で入力してください");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return { salt: bytesToBase64(salt), hash: await passwordDigest(value, salt) };
}

async function passwordMatches(room: any, password: unknown) {
  if (!room.password_hash || !room.password_salt) return true;
  const actual = await passwordDigest(String(password || ""), base64ToBytes(room.password_salt));
  if (actual.length !== room.password_hash.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ room.password_hash.charCodeAt(i);
  return diff === 0;
}

function code() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

async function userFor(req: Request) {
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!token) return null;
  const auth = createClient(URL, ANON_KEY, { auth: { persistSession: false } });
  const { data, error } = await auth.auth.getUser(token);
  return error ? null : data.user;
}

function sideOf(room: any, userId: string) {
  if (room.host_id === userId) return 0;
  if (room.guest_id === userId) return 1;
  return -1;
}

const ALL_PROTOCOLS: string[] = (cards as any).protocols.map((p: any) => p.name);
/* 公式ドラフト順: 先手1 → 後手2 → 先手2 → 後手1 (各自3つ) */
function draftSteps(first: number) {
  const o = 1 - first;
  return [{ side: first, n: 1 }, { side: o, n: 2 }, { side: first, n: 2 }, { side: o, n: 1 }];
}

function cardAliases(st: any) {
  const forward: Record<string, string> = {}, reverse: Record<string, string> = {};
  Object.keys(st.cards).sort().forEach((uid, i) => { const alias = "c" + i; forward[uid] = alias; reverse[alias] = uid; });
  return { forward, reverse };
}

function aliasCandidate(value: any, forward: Record<string, string>) {
  if (typeof value !== "string") return value;
  if (forward[value]) return forward[value];
  const parts = value.split("|");
  if (forward[parts[0]]) { parts[0] = forward[parts[0]]; return parts.join("|"); }
  return value;
}

function publicRequest(request: any, forward: Record<string, string>) {
  if (!request) return null;
  const out = structuredClone(request);
  if (Array.isArray(out.candidates)) out.candidates = out.candidates.map((x: any) => aliasCandidate(x, forward));
  return out;
}

function engineState(roomState: any) {
  const st = structuredClone(roomState);
  delete st.__trace;
  if (st.pending && st.pending.base) delete st.pending.base.__trace;
  return st;
}

function publicGame(st: any, side: number, aliases = cardAliases(st)) {
  const opponent = 1 - side;
  return {
    turn: st.turn, phase: st.phase, control: st.control, winner: st.winner,
    protocols: st.players.map((p: any) => p.protocols),
    totals: st.lines.map((_: any, line: number) => [Engine.lineTotal(st, line, 0), Engine.lineTotal(st, line, 1)]),
    counts: st.players.map((p: any) => ({ hand: p.hand.length, deck: p.deck.length, trash: p.trash.length })),
    lines: st.lines.map((line: any[]) => line.map((stack: string[], owner: number) =>
      stack.map((uid) => {
        const c = st.cards[uid];
        const hidden = !c.faceUp && owner === opponent;
        return { uid: aliases.forward[uid], owner, faceUp: c.faceUp, def: hidden ? null : c.def, value: Engine.cardValue(st, uid) };
      }))),
    hand: st.players[side].hand.map((uid: string) => ({ uid: aliases.forward[uid], def: st.cards[uid].def })),
    trash: st.players.map((p: any) => p.trash.map((uid: string) => ({ uid: aliases.forward[uid], def: st.cards[uid].def }))),
  };
}

function publicState(room: any, side: number) {
  const st = room.game_state;
  const base: any = {
    code: room.code, title: room.title, status: room.status, version: room.version, side,
    names: [room.host_name, room.guest_name],
    protocols: [room.host_protocols, room.guest_protocols],
  };
  if (room.status === "draft" && room.draft_state && room.draft_state.on) {
    const ds = room.draft_state;
    const steps = draftSteps(ds.first);
    const cur = steps[ds.step];
    base.draft = {
      pool: ds.pool || [], step: ds.step, first: ds.first,
      active: cur ? cur.side : -1, toPick: cur ? cur.n : 0,
    };
  }
  if (!st) return base;
  const aliases = cardAliases(st);
  const opponent = 1 - side;
  base.game = {
    turn: st.turn, phase: st.phase, control: st.control, winner: st.winner,
    protocols: st.players.map((p: any) => p.protocols),
    totals: st.lines.map((_: any, line: number) => [Engine.lineTotal(st, line, 0), Engine.lineTotal(st, line, 1)]),
    counts: st.players.map((p: any) => ({ hand: p.hand.length, deck: p.deck.length, trash: p.trash.length })),
    lines: st.lines.map((line: any[]) => line.map((stack: string[], owner: number) =>
      stack.map((uid) => {
        const c = st.cards[uid];
        const hidden = !c.faceUp && owner === opponent;
        return { uid: aliases.forward[uid], owner, faceUp: c.faceUp, def: hidden ? null : c.def, value: Engine.cardValue(st, uid) };
      }))),
    hand: st.players[side].hand.map((uid: string) => ({ uid: aliases.forward[uid], def: st.cards[uid].def })),
    trash: st.players.map((p: any) => p.trash.map((uid: string) => ({ uid: aliases.forward[uid], def: st.cards[uid].def }))),
  };
  base.trace = Array.isArray(st.__trace)
    ? st.__trace.map((entry: any) => ({
      msg: entry.msg,
      uid: entry.uid ? aliases.forward[entry.uid] : null,
      game: publicGame(entry.st, side, aliases),
    }))
    : [];
  // 直近アクションの公開ログ(隠し情報は含まれない)。クライアントの発動演出に使う。
  base.log = Array.isArray(room.last_log) ? room.last_log : [];
  const pending = room.pending_request;
  base.request = pending && pending.player === side ? publicRequest(pending, aliases.forward) : null;
  if (!pending && st.turn === side && st.phase === "action" && st.winner === null) {
    base.legalActions = Engine.legalActions(st).map((action: any) => {
      const out = structuredClone(action);
      if (out.card) out.card = aliases.forward[out.card];
      return out;
    });
  } else base.legalActions = [];
  return base;
}

function privateAction(action: any, st: any) {
  const aliases = cardAliases(st).reverse;
  const out = structuredClone(action);
  if (out.card && aliases[out.card]) out.card = aliases[out.card];
  if (Array.isArray(out.picks)) out.picks = out.picks.map((value: any) => {
    if (typeof value !== "string") return value;
    if (aliases[value]) return aliases[value];
    const parts = value.split("|");
    if (aliases[parts[0]]) { parts[0] = aliases[parts[0]]; return parts.join("|"); }
    return value;
  });
  return out;
}

async function getRoom(roomCode: string) {
  const { data, error } = await admin.from("secure_rooms").select("*").eq("code", roomCode).maybeSingle();
  if (error) throw error;
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors(req) });
  if (req.method !== "POST") return fail(req, "POST only", 405);
  const user = await userFor(req);
  if (!user) return fail(req, "認証が必要です", 401);
  let body: any;
  try { body = await req.json(); } catch { return fail(req, "JSONが不正です"); }
  const op = String(body.op || "");

  try {
    if (op === "list") {
      await admin.rpc("cleanup_secure_rooms");
      const lobbySince = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
      const { data, error } = await admin.from("secure_rooms")
        .select("code,title,host_name,password_hash,draft_state,created_at")
        .eq("visibility", "public").eq("status", "waiting").is("guest_id", null)
        .gte("updated_at", lobbySince)
        .order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      return json(req, { rooms: (data || []).map((room: any) => ({
        code: room.code, title: room.title, hostName: room.host_name,
        locked: !!room.password_hash, draft: !!room.draft_state, createdAt: room.created_at,
      })) });
    }

    if (op === "create") {
      const name = cleanName(body.name);
      if (!name) return fail(req, "表示名を入力してください");
      const title = cleanTitle(body.title);
      const visibility = body.visibility === "private" ? "private" : "public";
      let password;
      try { password = await roomPassword(body.password); } catch (error) { return fail(req, String((error as Error).message)); }
      await admin.rpc("cleanup_secure_rooms");
      const since = new Date(Date.now() - 60_000).toISOString();
      const { count, error: countError } = await admin.from("secure_rooms")
        .select("id", { count: "exact", head: true }).eq("host_id", user.id).gte("created_at", since);
      if (countError) throw countError;
      if ((count || 0) >= 5) return fail(req, "ルーム作成が多すぎます。1分待ってください", 429);
      let created: any = null;
      for (let i = 0; i < 8 && !created; i++) {
        const { data, error } = await admin.from("secure_rooms").insert({
          code: code(), host_id: user.id, host_name: name, title, visibility,
          password_salt: password.salt, password_hash: password.hash,
          draft_state: body.draft ? { on: true } : null,
        }).select("*").single();
        if (!error) created = data;
        else if (error.code !== "23505") throw error;
      }
      if (!created) return fail(req, "ルームコードを作成できませんでした", 503);
      return json(req, publicState(created, 0));
    }

    const roomCode = cleanCode(body.code);
    if (roomCode.length !== 6) return fail(req, "6桁のルームコードを入力してください");
    let room = await getRoom(roomCode);
    if (!room) return fail(req, "ルームが見つかりません", 404);

    if (op === "join") {
      const name = cleanName(body.name);
      if (!name) return fail(req, "表示名を入力してください");
      if (room.host_id !== user.id && room.guest_id && room.guest_id !== user.id) return fail(req, "満室です", 409);
      if (!room.guest_id && room.host_id !== user.id) {
        if (!(await passwordMatches(room, body.password))) return fail(req, "パスワードが違います", 403);
        const isDraft = !!(room.draft_state && room.draft_state.on);
        const upd: any = { guest_id: user.id, guest_name: name, updated_at: new Date().toISOString() };
        if (isDraft) {
          // ドラフト開始: 先手後攻をランダム抽選し、全プロトコルをプールに並べる
          const first = Math.random() < 0.5 ? 0 : 1;
          upd.status = "draft";
          upd.host_protocols = [];
          upd.guest_protocols = [];
          upd.draft_state = { on: true, pool: ALL_PROTOCOLS.slice(), first, step: 0 };
        } else {
          upd.status = "setup";
        }
        const { data, error } = await admin.from("secure_rooms")
          .update(upd).eq("id", room.id).is("guest_id", null).select("*").maybeSingle();
        if (error) return fail(req, "同時参加が発生しました。もう一度お試しください", 409);
        if (!data) return fail(req, "同時参加が発生しました。もう一度お試しください", 409);
        room = data;
      }
      const side = sideOf(room, user.id);
      return side < 0 ? fail(req, "参加できません", 403) : json(req, publicState(room, side));
    }

    const side = sideOf(room, user.id);
    if (side < 0) return fail(req, "このルームの参加者ではありません", 403);
    if (op === "get") return json(req, publicState(room, side));

    if (op === "protocols") {
      const protocols = Array.isArray(body.protocols) ? body.protocols.map(String) : [];
      const valid = new Set((cards as any).protocols.map((p: any) => p.name));
      if (protocols.length !== 3 || new Set(protocols).size !== 3 || protocols.some((p: string) => !valid.has(p))) {
        return fail(req, "異なるプロトコルを3つ選択してください");
      }
      const other = side === 0 ? room.guest_protocols : room.host_protocols;
      if (other?.some((p: string) => protocols.includes(p))) return fail(req, "相手が選択済みのプロトコルは選べません", 409);
      const field = side === 0 ? "host_protocols" : "guest_protocols";
      const { data, error } = await admin.from("secure_rooms").update({ [field]: protocols, updated_at: new Date().toISOString() })
        .eq("id", room.id).eq("version", room.version).select("*").single();
      if (error) return fail(req, "状態が更新されています。再試行してください", 409);
      room = data;
      if (room.host_protocols?.length === 3 && room.guest_protocols?.length === 3 && !room.game_state) {
        const result = Engine.newGame({ p0: room.host_protocols, p1: room.guest_protocols, seed: crypto.getRandomValues(new Uint32Array(1))[0], useControl: true });
        const { data: started, error: startError } = await admin.from("secure_rooms").update({
          game_state: result.state, pending_request: result.requests[0] || null,
          last_log: Array.isArray(result.log) ? result.log : [],
          status: "playing", version: room.version + 1,
          updated_at: new Date().toISOString(),
        }).eq("id", room.id).eq("version", room.version).select("*").single();
        if (startError) return fail(req, "対戦開始が競合しました", 409);
        room = started;
      }
      return json(req, publicState(room, side));
    }

    if (op === "draftpick") {
      if (room.status !== "draft" || !room.draft_state || !room.draft_state.on) return fail(req, "ドラフト中ではありません", 409);
      if (Number(body.version) !== Number(room.version)) return fail(req, "状態が更新されています", 409);
      const ds = room.draft_state;
      const steps = draftSteps(ds.first);
      const step = steps[ds.step];
      if (!step) return fail(req, "ドラフトは終了しています", 409);
      if (step.side !== side) return fail(req, "あなたのドラフト順ではありません", 403);
      const picks = Array.isArray(body.picks) ? body.picks.map(String) : [];
      if (picks.length !== step.n) return fail(req, `このステップでは${step.n}個選んでください`);
      if (new Set(picks).size !== picks.length || picks.some((p: string) => (ds.pool || []).indexOf(p) < 0)) {
        return fail(req, "選択が不正です");
      }
      const field = side === 0 ? "host_protocols" : "guest_protocols";
      const nextProtos = (room[field] || []).concat(picks);
      const nextPool = (ds.pool || []).filter((p: string) => picks.indexOf(p) < 0);
      const nextStep = ds.step + 1;
      const upd: any = {
        [field]: nextProtos,
        draft_state: { on: true, pool: nextPool, first: ds.first, step: nextStep },
        version: room.version + 1, updated_at: new Date().toISOString(),
      };
      if (nextStep >= steps.length) {
        const host = side === 0 ? nextProtos : (room.host_protocols || []);
        const guest = side === 1 ? nextProtos : (room.guest_protocols || []);
        const result = Engine.newGame({
          p0: host, p1: guest, seed: crypto.getRandomValues(new Uint32Array(1))[0],
          useControl: true, first: ds.first,
        });
        upd.game_state = result.state;
        upd.pending_request = result.requests[0] || null;
        upd.last_log = Array.isArray(result.log) ? result.log : [];
        upd.status = "playing";
        upd.draft_state = { on: true, pool: [], first: ds.first, step: nextStep, done: true };
      }
      const { data, error } = await admin.from("secure_rooms").update(upd)
        .eq("id", room.id).eq("version", room.version).select("*").single();
      if (error) return fail(req, "相手の操作と競合しました。再読み込みします", 409);
      return json(req, publicState(data, side));
    }

    if (op === "action") {
      if (room.status !== "playing" || !room.game_state) return fail(req, "対戦中ではありません", 409);
      if (Number(body.version) !== Number(room.version)) return fail(req, "状態が更新されています", 409);
      const st = engineState(room.game_state);
      const pending = room.pending_request;
      const action = privateAction(body.action, st);
      if (!action || typeof action.type !== "string") return fail(req, "操作が不正です");
      if (action.type !== "surrender" && (pending ? pending.player !== side : st.turn !== side)) return fail(req, "あなたの操作待ちではありません", 403);
      if (action.type === "surrender") action.player = side;
      const result = Engine.apply(st, action);
      if (result.error) return fail(req, result.error);
      const nextVersion = room.version + 1;
      const nextGame = result.view
        ? { ...result.view, pending: result.state?.pending || null }
        : result.state;
      nextGame.__trace = Array.isArray(result.trace) ? result.trace : [];
      const { data, error } = await admin.from("secure_rooms").update({
        game_state: nextGame, pending_request: result.requests[0] || null,
        last_log: Array.isArray(result.log) ? result.log : [],
        status: result.winner === null ? "playing" : "finished", version: nextVersion,
        last_action_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      }).eq("id", room.id).eq("version", room.version).select("*").single();
      if (error) return fail(req, "相手の操作と競合しました。再読み込みします", 409);
      return json(req, publicState(data, side));
    }
    return fail(req, "未知の操作です", 404);
  } catch (error) {
    console.error(error);
    return fail(req, "サーバー処理に失敗しました", 500);
  }
});
