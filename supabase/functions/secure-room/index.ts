import { createClient } from "npm:@supabase/supabase-js@2";
import "../_shared/engine.js";
import cards from "../_shared/cards.json" with { type: "json" };
import effects from "../_shared/effects.json" with { type: "json" };
import { weeklySet } from "../_shared/weekly-set.js";

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

/* 手番の持ち時間 (ミリ秒)。相手がこれより長く止まっていたら、時間切れ勝ちを主張できる */
const TURN_LIMIT_MS = 120_000;
/* 待機中の部屋を「まだ人がいる」とみなす長さ。作った人の画面が問い合わせるたびに更新時刻を新しくする */
const WAITING_FRESH_MS = 90_000;

/* 相手に見せる称号 (見た目だけ)。決まった一覧にあるものだけ。無ければ null */
const BADGES = ["compiler", "veteran", "tactician", "expert", "architect", "master", "legend", "ascended", "underdog",
  "chainer", "flawless", "grandmaster", "platinum"];
function cleanBadge(value: unknown) {
  const v = String(value || "");
  return BADGES.includes(v) ? v : null;
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

/* レート戦は本人が続けて使うアカウントに限る。
   匿名セッションは端末やブラウザを変えるだけで別人になり、
   負けたら作り直せてしまうのでレートが意味を失う。 */
function isRatedEligible(user: any) {
  return !!user && user.is_anonymous !== true;
}

/* 管理者か。ゲスト (匿名) は対象外。admins 表は service role でしか読めない */
async function isAdmin(user: any) {
  if (!user || user.is_anonymous === true) return false;
  const { data, error } = await admin.from("admins").select("user_id").eq("user_id", user.id).maybeSingle();
  return !error && !!data;
}

function sideOf(room: any, userId: string) {
  if (room.host_id === userId) return 0;
  if (room.guest_id === userId) return 1;
  return -1;
}

const ALL_PROTOCOLS: string[] = (cards as any).protocols.map((p: any) => p.name);

/* ドラフトのルール。poolSize: 候補として抽選するプロトコルの数 (0 = 全部)、bans: 各自の BAN 数。
   候補は「各自3つ + BAN ぶん」より少なくできない */
function cleanDraftRules(raw: any) {
  const bans = Math.max(0, Math.min(3, Math.floor(Number(raw && raw.bans) || 0)));
  let poolSize = Math.floor(Number(raw && raw.poolSize) || 0);
  if (poolSize > 0) poolSize = Math.max(6 + bans * 2, Math.min(ALL_PROTOCOLS.length, poolSize));
  if (poolSize >= ALL_PROTOCOLS.length) poolSize = 0;
  return { poolSize, bans };
}

function shuffled<T>(list: T[]): T[] {
  const a = list.slice();
  const rnd = crypto.getRandomValues(new Uint32Array(a.length));
  for (let i = a.length - 1; i > 0; i--) {
    const j = rnd[i] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/* ドラフト順: まず BAN を先手から1つずつ交互に、次に公式順で選ぶ (先手1 → 後手2 → 先手2 → 後手1、各自3つ) */
function draftSteps(first: number, bans = 0) {
  const o = 1 - first;
  const steps: { side: number; n: number; kind: string }[] = [];
  for (let i = 0; i < bans * 2; i++) steps.push({ side: i % 2 === 0 ? first : o, n: 1, kind: "ban" });
  return steps.concat([
    { side: first, n: 1, kind: "pick" }, { side: o, n: 2, kind: "pick" },
    { side: first, n: 2, kind: "pick" }, { side: o, n: 1, kind: "pick" },
  ]);
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
  /* 現在選んでいる移動対象。選択要求は本人にしか渡さず、uid も対局内別名にする。 */
  if (Array.isArray(out.focus)) out.focus = out.focus.map((x: any) => aliasCandidate(x, forward));
  else if (out.focus) out.focus = aliasCandidate(out.focus, forward);
  return out;
}

/* レート戦・順位表に出す名前は、部屋ごとに入れた名前ではなく、アカウントに保存した表示名 (player_saves) を使う。
   保存が無い人 (まだ同期していない) だけ、部屋に入ったときの名前を使う */
async function accountNames(ids: string[]) {
  const { data } = await admin.from("player_saves").select("user_id,data").in("user_id", ids);
  const out: Record<string, string> = {};
  for (const row of data || []) {
    const n = cleanName(row && row.data && row.data.compileRoomName).slice(0, 12);
    if (n) out[row.user_id] = n;
  }
  return out;
}

/* いたずら対策の回数 (attempt_log)。直近 ms のうちに kind を何回したか。room を渡すと部屋ごとに数える */
async function recentAttempts(kind: string, ms: number, userId: string | null, roomId: string | null = null) {
  const since = new Date(Date.now() - ms).toISOString();
  let q = admin.from("attempt_log").select("id", { count: "exact", head: true }).eq("kind", kind).gte("created_at", since);
  q = roomId ? q.eq("room_id", roomId) : q.eq("user_id", userId);
  const { count, error } = await q;
  if (error) throw error;
  return count || 0;
}
async function noteAttempt(kind: string, userId: string, roomId: string | null = null) {
  await admin.from("attempt_log").insert({ kind, user_id: userId, room_id: roomId });
  /* 1日たった記録は捨てる (表を大きくしない) */
  await admin.from("attempt_log").delete().lt("created_at", new Date(Date.now() - 86400_000).toISOString());
}

async function recordRatedMatch(room: any, winner: number) {
  if (!room.rated || !room.host_id || !room.guest_id || !room.host_name || !room.guest_name) return;
  const names = await accountNames([room.host_id, room.guest_id]).catch(() => ({} as Record<string, string>));
  const { error } = await admin.rpc("record_rated_match", {
    p_room_id: room.id,
    p_host_id: room.host_id,
    p_guest_id: room.guest_id,
    p_host_name: names[room.host_id] || room.host_name,
    p_guest_name: names[room.guest_id] || room.guest_name,
    p_host_protocols: room.host_protocols || [],
    p_guest_protocols: room.guest_protocols || [],
    p_winner: winner,
  });
  if (error) throw error;
}

function engineState(roomState: any) {
  const st = structuredClone(roomState);
  delete st.__trace;
  if (st.pending && st.pending.base) delete st.pending.base.__trace;
  return st;
}

function publicGame(st: any, side: number, aliases = cardAliases(st)) {
  return {
    turn: st.turn, phase: st.phase, control: st.control, winner: st.winner,
    protocols: st.players.map((p: any) => p.protocols),
    totals: st.lines.map((_: any, line: number) => [Engine.lineTotal(st, line, 0), Engine.lineTotal(st, line, 1)]),
    counts: st.players.map((p: any) => ({ hand: p.hand.length, deck: p.deck.length, trash: p.trash.length })),
    lines: st.lines.map((line: any[]) => line.map((stack: string[], owner: number) =>
      stack.map((uid) => {
        const c = st.cards[uid];
        const hidden = !c.faceUp && !((c.knownTo || 0) & (1 << side));
        return { uid: aliases.forward[uid], owner, faceUp: c.faceUp, def: hidden ? null : c.def, value: Engine.cardValue(st, uid) };
      }))),
    hand: st.players[side].hand.map((uid: string) => ({ uid: aliases.forward[uid], def: st.cards[uid].def })),
    trash: st.players.map((p: any) => p.trash.map((uid: string) => ({ uid: aliases.forward[uid], def: st.cards[uid].def }))),
    /* 手札公開 (PSYCHIC 0 等): 公開されたカードは両者に見える */
    revealed: st.revealed && Array.isArray(st.revealed.cards)
      ? { kind: st.revealed.kind, player: st.revealed.player, cards: st.revealed.cards.slice(), seq: st.revealed.seq }
      : null,
    /* 宣言 (LUCK 0/3) とその結果。声に出す情報なので両者に見せる */
    announce: st.announce ? { ...st.announce } : null,
    /* 移動中 (committed) のカード: クライアントの transit 演出用。
       正体は可視性ルールに従う (相手の裏向きは def を伏せる) */
    committed: (st.commitStack || []).map((uid: string) => {
      const c = st.cards[uid];
      if (!c || c.zone !== 'committed') return null;
      const hidden = !c.faceUp && !((c.knownTo || 0) & (1 << side));
      return {
        uid: aliases.forward[uid], owner: c.owner, faceUp: c.faceUp,
        def: hidden ? null : c.def, commitDest: c.commitDest || null,
      };
    }).filter(Boolean),
  };
}

/* 部屋が前回から変わったかを見分ける印。版 (手を指すたびに上がる)・状態・更新時刻をまとめる
   (待合室の参加・プロトコル決めは版を上げないので、更新時刻も入れる) */
function stampOf(room: any) {
  return `${room.version}|${room.status}|${room.updated_at || ""}`;
}

function publicState(room: any, side: number) {
  const st = room.game_state;
  const base: any = {
    code: room.code, title: room.title, status: room.status, version: room.version, side, stamp: stampOf(room),
    names: [room.host_name, room.guest_name],
    badges: [room.host_badge || null, room.guest_badge || null],
    lastActionAt: room.last_action_at || room.updated_at, turnLimitMs: TURN_LIMIT_MS, now: new Date().toISOString(),
    protocols: [room.host_protocols, room.guest_protocols],
    rated: !!room.rated,
  };
  if (room.status === "draft" && room.draft_state && room.draft_state.on) {
    const ds = room.draft_state;
    const rules = cleanDraftRules(ds.rules);
    const steps = draftSteps(ds.first, rules.bans);
    const cur = steps[ds.step];
    base.draft = {
      pool: ds.pool || [], step: ds.step, first: ds.first,
      active: cur ? cur.side : -1, toPick: cur ? cur.n : 0, kind: cur ? cur.kind : "pick",
      banned: ds.banned || [[], []], rules,
    };
  }
  if (!st) return base;
  const aliases = cardAliases(st);
  /* 再生用の途中経過 (trace) と同じ関数で作る。以前は手書きで別々に列挙していて、
     公開 (revealed)・宣言 (announce)・移動中 (committed) が現在の盤面に載らず、
     部屋に戻ったときや途中経過の無い更新で演出が出ない・移動中の札が消えることがあった。 */
  base.game = publicGame(st, side, aliases);
  base.trace = Array.isArray(st.__trace)
    ? st.__trace.map((entry: any) => ({
      msg: entry.msg,
      uid: entry.uid ? aliases.forward[entry.uid] : null,
      /* 処理中の効果の並び ("uid|段")。クライアントのチェーン表示に使う */
      chain: Array.isArray(entry.chain)
        ? entry.chain.map((link: string) => {
          const i = link.lastIndexOf("|");
          const alias = aliases.forward[link.slice(0, i)];
          return alias ? alias + link.slice(i) : null;
        }).filter(Boolean)
        : [],
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
    /* 管理者かどうか (ADMIN 画面の入口を出すため)。管理者の一覧は admins 表 (service role だけが読める) */
    if (op === "whoami") return json(req, { admin: await isAdmin(user) });

    /* ---- ここから管理者だけ ---- */
    if (op.startsWith("admin")) {
      if (!(await isAdmin(user))) return fail(req, "管理者だけが使えます", 403);
      if (op === "adminStats") {
        const { data, error } = await admin.rpc("admin_stats");
        if (error) throw error;
        return json(req, { stats: data });
      }
      /* ログインして遊んでいる人の一覧 (表示名・登録日・最後に遊んだ日・CPU 戦の数だけ。メールは出さない) */
      if (op === "adminPlayers") {
        const { data, error } = await admin.rpc("admin_players", { max_rows: 300 });
        if (error) throw error;
        return json(req, { players: data || [] });
      }
      if (op === "adminWeekly") {
        const week = String(body.week || "");
        if (!/^W[0-9]{3,6}$/.test(week)) return fail(req, "週の指定が不正です");
        const { data, error } = await admin.from("weekly_clears").select("week,user_id,name,attempts,cleared_at")
          .eq("week", week).order("cleared_at", { ascending: true }).limit(200);
        if (error) throw error;
        return json(req, { clears: data || [] });
      }
      if (op === "adminWeeklyDelete") {
        const week = String(body.week || ""), uid = String(body.userId || "");
        if (!/^W[0-9]{3,6}$/.test(week) || !/^[0-9a-f-]{36}$/.test(uid)) return fail(req, "指定が不正です");
        const { error } = await admin.from("weekly_clears").delete().eq("week", week).eq("user_id", uid);
        if (error) throw error;
        return json(req, { ok: true });
      }
      if (op === "adminRooms") {
        const { data, error } = await admin.from("secure_rooms")
          .select("code,title,status,host_name,guest_name,visibility,rated,created_at,updated_at")
          .order("updated_at", { ascending: false }).limit(100);
        if (error) throw error;
        return json(req, { rooms: data || [] });
      }
      if (op === "adminCloseRoom") {
        const roomCode = cleanCode(body.code);
        if (roomCode.length !== 6) return fail(req, "部屋の番号が不正です");
        const { error } = await admin.from("secure_rooms").delete().eq("code", roomCode);
        if (error) throw error;
        return json(req, { ok: true });
      }
      return fail(req, "不明な管理操作です");
    }

    /* アカウントを消す (Google 等でログインした本人だけ)。戦績・経験値・保存・リプレイ・クリア者一覧などの表は
       どれも auth.users に on delete cascade で紐づいているので、ユーザーを消せば一緒に消える */
    if (op === "deleteAccount") {
      if (user.is_anonymous === true) return fail(req, "ログインしていません", 403);
      if (body.confirm !== "DELETE") return fail(req, "確認が必要です");
      const { error } = await admin.auth.admin.deleteUser(user.id);
      if (error) throw error;
      return json(req, { ok: true });
    }

    if (op === "list") {
      await admin.rpc("cleanup_secure_rooms");
      /* 作った人が画面を閉じた部屋 (更新が止まった部屋) は出さない。クイックマッチが無人の部屋に入らないように */
      const lobbySince = new Date(Date.now() - WAITING_FRESH_MS).toISOString();
      const { data, error } = await admin.from("secure_rooms")
        .select("code,title,host_name,password_hash,draft_state,rated,created_at")
        .eq("visibility", "public").eq("status", "waiting").is("guest_id", null)
        .gte("updated_at", lobbySince)
        .order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      /* いま何人いるか (ロビーに出す): 待っている部屋と、10分以内に動いた対戦中の部屋 */
      const [{ count: playing }] = await Promise.all([
        admin.from("secure_rooms").select("id", { count: "exact", head: true }).eq("status", "playing")
          .gte("updated_at", new Date(Date.now() - 10 * 60_000).toISOString()),
      ]);
      return json(req, { waiting: (data || []).length, playing: playing || 0, rooms: (data || []).map((room: any) => ({
        code: room.code, title: room.title, hostName: room.host_name,
        locked: !!room.password_hash, draft: !!room.draft_state, rated: !!room.rated, createdAt: room.created_at,
        draftRules: room.draft_state ? cleanDraftRules(room.draft_state.rules) : null,
      })) });
    }

    /* 週替わり3連戦のクリアを一覧に載せる。3戦のリプレイ (始めの条件と手の列) をエンジンで当て直して、
       その週の9つを3つずつ重ねずに使い、その週の3人の相手に勝ったことを確かめてから載せる */
    if (op === "weeklySubmit") {
      if (user.is_anonymous === true) return fail(req, "ログインすると名前を載せられます", 403);
      const week = String(body.week || "");
      if (!/^W[0-9]{3,6}$/.test(week)) return fail(req, "週の指定が不正です");
      /* 送信のたびに3試合ぶん再生して確かめるので、連打は止める (10分に5回まで) */
      if (await recentAttempts("weekly", 10 * 60_000, user.id) >= 5) return fail(req, "送信が多すぎます。10分ほど待ってください", 429);
      await noteAttempt("weekly", user.id);
      const nowWeek = Math.floor((Math.floor((Date.now() + 9 * 3600_000) / 86400_000) + 3) / 7);
      const idx = Number(week.slice(1));
      if (idx !== nowWeek && idx !== nowWeek - 1) return fail(req, "今週か先週のクリアだけ載せられます", 409);
      const name = String(body.name || "").replace(/[\u0000-\u001f\u007f<>]/g, "").trim();
      if (name.length < 1 || name.length > 16) return fail(req, "名前は1〜16文字で入れてください");
      const attempts = Math.floor(Number(body.attempts));
      if (!(attempts >= 1 && attempts <= 999)) return fail(req, "挑戦回数が不正です");
      const reps = Array.isArray(body.replays) ? body.replays : [];
      if (reps.length !== 3) return fail(req, "3戦ぶんのリプレイが必要です");
      const set = weeklySet(week, ALL_PROTOCOLS);
      const used = new Set<string>();
      const sameSet = (a: string[], b: string[]) => a.length === b.length && a.slice().sort().join() === b.slice().sort().join();
      const decks: string[][] = [];
      for (let i = 0; i < 3; i++) {
        const r = reps[i] || {};
        const init = r.init || {};
        const p0 = Array.isArray(init.p0) ? init.p0.map(String) : [];
        const p1 = Array.isArray(init.p1) ? init.p1.map(String) : [];
        const actions = Array.isArray(r.actions) ? r.actions : [];
        if (p0.length !== 3 || p0.some((n: string) => !set.nine.includes(n) || used.has(n))) return fail(req, "第" + (i + 1) + "戦のプロトコルが今週の9つと合いません", 409);
        if (!sameSet(p1, set.opponents[i].deck)) return fail(req, "第" + (i + 1) + "戦の相手が今週の相手と合いません", 409);
        if (Number(init.winCompiles) !== 2 || actions.length > 3000) return fail(req, "第" + (i + 1) + "戦の記録が不正です", 409);
        p0.forEach((n: string) => used.add(n));
        decks.push(p0);
        /* 当て直しは途中経過 (trace) を取らずに軽く行う。この間は他の処理が割り込まない (await しない) */
        Engine.setTrace(false);
        let res: any;
        try {
          res = Engine.newGame({ seed: Number(init.seed) | 0, p0, p1, first: init.first === 1 ? 1 : 0, winCompiles: 2 });
          for (const a of actions) {
            if (res.winner !== null) break;
            res = Engine.apply(res.state, a);
            if (res.error) break;
          }
        } finally {
          Engine.setTrace(true);
        }
        if (!res || res.error || res.winner !== 0) return fail(req, "第" + (i + 1) + "戦の勝ちを確かめられませんでした", 409);
      }
      const { error } = await admin.from("weekly_clears").insert({ week, user_id: user.id, name, attempts, decks });
      if (error) {
        if (/duplicate|unique/i.test(error.message)) return fail(req, "今週はもう載っています", 409);
        throw error;
      }
      return json(req, { ok: true });
    }

    if (op === "history") {
      const [{ data: profile, error: profileError }, { data: matches, error: matchesError }] = await Promise.all([
        admin.from("rated_players").select("rating,games,wins,season").eq("user_id", user.id).maybeSingle(),
        admin.from("rated_matches")
          .select("id,host_id,guest_id,host_name,guest_name,host_protocols,guest_protocols,winner,host_rating_before,host_rating_after,guest_rating_before,guest_rating_after,ended_at")
          .or(`host_id.eq.${user.id},guest_id.eq.${user.id}`).order("ended_at", { ascending: false }).limit(500),
      ]);
      if (profileError || matchesError) throw profileError || matchesError;
      /* シーズン (1か月、日本時間): 今シーズンの順位表と、自分の過去のシーズン。
         前の月のまま遊んでいない人の成績は、次に遊ぶまで前のシーズンの数字として扱う */
      const season = "S" + new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7).replace("-", "");
      const [{ data: board }, { data: seasons }] = await Promise.all([
        admin.rpc("rated_leaderboard", { p_season: season, p_limit: 20 }),
        admin.rpc("rated_my_seasons", { p_user: user.id }),
      ]);
      const fresh = profile && profile.season === season;
      return json(req, {
        season,
        leaderboard: (board || []).map((r: any) => ({ name: r.name || "？", rating: r.rating, games: r.games, wins: r.wins, rank: Number(r.rank), me: r.user_id === user.id })),
        pastSeasons: (seasons || []).map((r: any) => ({ season: r.season, rating: r.rating, games: r.games, wins: r.wins, rank: Number(r.rank), players: Number(r.players) })),
        seasonRating: fresh ? profile.rating : profile ? Math.round(1500 + (profile.rating - 1500) / 2) : 1500,
        seasonGames: fresh ? profile.games : 0, seasonWins: fresh ? profile.wins : 0,
        rating: profile?.rating ?? 1500, games: profile?.games ?? 0, wins: profile?.wins ?? 0,
        matches: (matches || []).map((match: any) => {
          const host = match.host_id === user.id;
          return {
            id: match.id, endedAt: match.ended_at, result: match.winner === (host ? 0 : 1) ? "win" : "loss",
            opponent: host ? match.guest_name : match.host_name,
            myProtocols: host ? match.host_protocols : match.guest_protocols,
            opponentProtocols: host ? match.guest_protocols : match.host_protocols,
            ratingBefore: host ? match.host_rating_before : match.guest_rating_before,
            ratingAfter: host ? match.host_rating_after : match.guest_rating_after,
          };
        }),
      });
    }

    if (op === "create") {
      const name = cleanName(body.name);
      if (!name) return fail(req, "表示名を入力してください");
      const title = cleanTitle(body.title);
      if (body.rated === true && !isRatedEligible(user)) return fail(req, "レート戦にはログインが必要です", 403);
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
          code: code(), host_id: user.id, host_name: name, host_badge: cleanBadge(body.badge), title, visibility,
          password_salt: password.salt, password_hash: password.hash,
          draft_state: body.draft ? { on: true, rules: cleanDraftRules(body.draftRules) } : null,
          rated: body.rated === true,
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
      if (room.rated && !isRatedEligible(user)) return fail(req, "レート戦にはログインが必要です", 403);
      if (room.host_id !== user.id && room.guest_id && room.guest_id !== user.id) return fail(req, "満室です", 409);
      if (!room.guest_id && room.host_id !== user.id) {
        /* 鍵付きの部屋の総当たりを止める: 同じ人は10分に5回、同じ部屋は10分に20回まで間違えられる */
        if (room.password_hash) {
          if (await recentAttempts("join-pass", 10 * 60_000, user.id) >= 5
            || await recentAttempts("join-pass", 10 * 60_000, null, room.id) >= 20) {
            return fail(req, "パスワードの入力が多すぎます。10分ほど待ってください", 429);
          }
        }
        if (!(await passwordMatches(room, body.password))) {
          if (room.password_hash) await noteAttempt("join-pass", user.id, room.id);
          return fail(req, "パスワードが違います", 403);
        }
        const isDraft = !!(room.draft_state && room.draft_state.on);
        const upd: any = { guest_id: user.id, guest_name: name, guest_badge: cleanBadge(body.badge), updated_at: new Date().toISOString() };
        if (isDraft) {
          // ドラフト開始: 先手後攻をランダム抽選し、ルールどおりの数だけプロトコルを抽選してプールに並べる
          const first = Math.random() < 0.5 ? 0 : 1;
          const rules = cleanDraftRules(room.draft_state.rules);
          const pool = rules.poolSize ? shuffled(ALL_PROTOCOLS).slice(0, rules.poolSize) : ALL_PROTOCOLS.slice();
          upd.status = "draft";
          upd.host_protocols = [];
          upd.guest_protocols = [];
          upd.draft_state = { on: true, rules, pool, first, step: 0, banned: [[], []] };
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
    if (op === "get") {
      if (room.status === "waiting" && side === 0 && Date.now() - Date.parse(room.updated_at) > 25_000) {
        const now = new Date().toISOString();
        await admin.from("secure_rooms").update({ updated_at: now }).eq("id", room.id);
        room.updated_at = now;
      }
      /* 前回から変わっていなければ、盤面を丸ごと返さずに「変化なし」だけ返す (ポーリングの通信を減らす) */
      if (typeof body.stamp === "string" && body.stamp === stampOf(room)) {
        return json(req, { code: room.code, status: room.status, version: room.version, side, stamp: body.stamp, unchanged: true });
      }
      return json(req, publicState(room, side));
    }

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
        /* 先攻・後攻はランダム (以前は部屋を作った側が必ず先攻だった) */
        const first = Math.random() < 0.5 ? 0 : 1;
        const result = Engine.newGame({ p0: room.host_protocols, p1: room.guest_protocols, seed: crypto.getRandomValues(new Uint32Array(1))[0], useControl: true, first });
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
      const rules = cleanDraftRules(ds.rules);
      const steps = draftSteps(ds.first, rules.bans);
      const step = steps[ds.step];
      if (!step) return fail(req, "ドラフトは終了しています", 409);
      if (step.side !== side) return fail(req, "あなたのドラフト順ではありません", 403);
      const picks = Array.isArray(body.picks) ? body.picks.map(String) : [];
      if (picks.length !== step.n) return fail(req, `このステップでは${step.n}個選んでください`);
      if (new Set(picks).size !== picks.length || picks.some((p: string) => (ds.pool || []).indexOf(p) < 0)) {
        return fail(req, "選択が不正です");
      }
      const field = side === 0 ? "host_protocols" : "guest_protocols";
      /* BAN は自分のプロトコルにはならず、プールから外れるだけ */
      const isBan = step.kind === "ban";
      const nextProtos = isBan ? (room[field] || []) : (room[field] || []).concat(picks);
      const banned = [((ds.banned || [])[0] || []).slice(), ((ds.banned || [])[1] || []).slice()];
      if (isBan) banned[side] = banned[side].concat(picks);
      const nextPool = (ds.pool || []).filter((p: string) => picks.indexOf(p) < 0);
      const nextStep = ds.step + 1;
      const upd: any = {
        [field]: nextProtos,
        draft_state: { on: true, rules, pool: nextPool, first: ds.first, step: nextStep, banned },
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
        upd.draft_state = { on: true, rules, pool: [], first: ds.first, step: nextStep, banned, done: true };
      }
      const { data, error } = await admin.from("secure_rooms").update(upd)
        .eq("id", room.id).eq("version", room.version).select("*").single();
      if (error) return fail(req, "相手の操作と競合しました。再読み込みします", 409);
      return json(req, publicState(data, side));
    }

    /* 待機・ドラフト・プロトコル選択の途中で抜ける: 部屋を片付ける (対戦中は投了を使う) */
    if (op === "leave") {
      if (room.status === "playing") return fail(req, "対戦中は投了してください", 409);
      const { error } = await admin.from("secure_rooms").delete().eq("id", room.id);
      if (error) throw error;
      return json(req, { ok: true });
    }

    /* 時間切れ勝ち: 相手の番 (相手の選択待ち) のまま持ち時間を過ぎていたら、相手の投了として決着させる */
    if (op === "claimTimeout") {
      if (room.status !== "playing" || !room.game_state) return fail(req, "対戦中ではありません", 409);
      const st = engineState(room.game_state);
      const pending = room.pending_request;
      const waiting = pending ? pending.player : st.turn;
      if (waiting === side) return fail(req, "あなたの番です", 409);
      const since = Date.parse(room.last_action_at || room.updated_at);
      if (Date.now() - since < TURN_LIMIT_MS) return fail(req, "相手の持ち時間はまだ残っています", 409);
      const result = Engine.apply(st, { type: "surrender", player: waiting });
      if (result.error) return fail(req, result.error);
      return await commitResult(req, room, side, result);
    }

    if (op === "action") {
      if (room.status !== "playing" || !room.game_state) return fail(req, "対戦中ではありません", 409);
      const st = engineState(room.game_state);
      const pending = room.pending_request;
      const action = privateAction(body.action, st);
      if (!action || typeof action.type !== "string") return fail(req, "操作が不正です");
      /* 投了は相手の手と入れ違っても通す (版の確認をしない)。それ以外は同じ版の盤面に対してだけ受け付ける */
      if (action.type !== "surrender" && Number(body.version) !== Number(room.version)) return fail(req, "状態が更新されています", 409);
      if (action.type !== "surrender" && (pending ? pending.player !== side : st.turn !== side)) return fail(req, "あなたの操作待ちではありません", 403);
      if (action.type === "surrender") action.player = side;
      const result = Engine.apply(st, action);
      if (result.error) return fail(req, result.error);
      return await commitResult(req, room, side, result);
    }
    return fail(req, "未知の操作です", 404);
  } catch (error) {
    console.error(error);
    return fail(req, "サーバー処理に失敗しました", 500);
  }
});

/* エンジンの結果を部屋に書き込み、決着していればレート戦を記録する (手を指す・時間切れ勝ちで共通)。
   レート戦の記録に失敗したら ratedError を付けて返す (画面で知らせる) */
async function commitResult(req: Request, room: any, side: number, result: any) {
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
      let ratedError = false;
      if (result.winner !== null && room.rated) {
        try { await recordRatedMatch(room, result.winner); }
        catch (ratingError) { console.error("rated match record failed", ratingError); ratedError = true; }
      }
      return json(req, ratedError ? { ...publicState(data, side), ratedError: true } : publicState(data, side));
}
