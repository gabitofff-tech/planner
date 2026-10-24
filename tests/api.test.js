import { test } from "node:test";
import assert from "node:assert/strict";
import worker, {
  schema,
  upsert,
  verifyTelegram,
  webhookSecret,
  scheduled,
} from "../server/worker.js";
import { database } from "./db.js";
import { createHmac } from "node:crypto";
const envFor = () => ({
  DB: database(),
  LOCAL_DEV: "true",
  SERVICE_KEY: "test-only-service",
  BOT_TOKEN: "test-only-bot",
});
const ctx = () => ({
  promises: [],
  waitUntil(p) {
    this.promises.push(p);
  },
});
const req = (path, body, headers = {}) =>
  new Request("http://localhost" + path, {
    method: body ? "POST" : "GET",
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
const record = (id, title = "Task", updated_at = Date.now()) => ({
  id,
  title,
  date: "2026-10-24",
  duration_min: 30,
  updated_at,
});
const auth = (id) => ({
  "X-Service-Key": "test-only-service",
  "X-Telegram-User-Id": id,
});
test("API smoke: health, authentication, isolation, LWW, tombstone and revision pull", async () => {
  const env = envFor(),
    c = ctx();
  assert.equal((await worker.fetch(req("/api/health"), env, c)).status, 200);
  assert.equal(
    (await worker.fetch(req("/api/tasks/sync"), env, c)).status,
    401,
  );
  const local = await (
    await worker.fetch(req("/api/auth/local", {}), env, c)
  ).json();
  assert.ok(local.key);
  const first = await (
    await worker.fetch(
      req("/api/tasks/sync", { records: [record("a", "new", 200)] }, auth("1")),
      env,
      c,
    )
  ).json();
  assert.equal(first.records[0].title, "new");
  const rev = first.records[0].rev;
  await worker.fetch(
    req("/api/tasks/sync", { records: [record("a", "old", 100)] }, auth("1")),
    env,
    c,
  );
  let pull = await (await worker.fetch(req("/api/tasks/sync"), env, c)).json();
  assert.ok(pull.error);
  pull = await (
    await worker.fetch(req("/api/tasks/sync", null, auth("1")), env, c)
  ).json();
  assert.equal(pull.records[0].title, "new");
  assert.equal(
    (
      await (
        await worker.fetch(req("/api/tasks/sync", null, auth("2")), env, c)
      ).json()
    ).records.length,
    0,
  );
  await worker.fetch(
    req(
      "/api/tasks/sync",
      { records: [{ ...record("a", "new", 300), deleted: true }] },
      auth("1"),
    ),
    env,
    c,
  );
  pull = await (
    await worker.fetch(
      req(`/api/tasks/sync?since=${rev}`, null, auth("1")),
      env,
      c,
    )
  ).json();
  assert.equal(pull.records[0].deleted, true);
  assert.ok(pull.cursor > rev);
  assert.equal(
    (
      await worker.fetch(
        req(
          "/api/tasks/sync",
          { records: [record("bad", "future", Date.now() + 3600000)] },
          auth("1"),
        ),
        env,
        c,
      )
    ).status,
    400,
  );
  await worker.fetch(
    req(
      "/api/items/sync",
      {
        records: [
          {
            id: "hl/a:2026-10-24",
            kind: "habit_log",
            data: { done: true },
            updated_at: 400,
          },
        ],
      },
      auth("1"),
    ),
    env,
    c,
  );
  assert.equal(
    (
      await (
        await worker.fetch(
          req("/api/items/sync", null, {
            Authorization: `Bearer ${local.key}`,
          }),
          env,
          c,
        )
      ).json()
    ).records.length,
    1,
  );
  env.DB.close();
});
test("Telegram HMAC, expiration and forged identity", async () => {
  const token = "token",
    p = new URLSearchParams({
      auth_date: String(Math.floor(Date.now() / 1000)),
      user: JSON.stringify({ id: 123 }),
    });
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const check = [...p]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
  p.set("hash", createHmac("sha256", secret).update(check).digest("hex"));
  assert.equal(await verifyTelegram(p.toString(), token), "123");
  assert.equal(
    await verifyTelegram(p.toString(), token, Date.now() + 7200000),
    null,
  );
  p.set("user", '{"id":999}');
  assert.equal(await verifyTelegram(p.toString(), token), null);
});
test("Telegram voice, AI fallback, immediate webhook response and idempotent updates", async () => {
  const env = envFor(),
    c = ctx();
  let aiCalls = 0;
  const sent = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (String(url).includes("/getFile"))
      return Response.json({ ok: true, result: { file_path: "voice.ogg" } });
    if (String(url).includes("/file/bot"))
      return new Response(new Uint8Array([1, 2, 3]));
    sent.push(JSON.parse(options.body));
    return Response.json({ ok: true, result: {} });
  };
  env.AI = {
    async run(model, args) {
      if (model.includes("whisper")) {
        assert.equal(args.language, "ru");
        assert.equal(args.audio, "AQID");
        return { text: "Купить молоко завтра" };
      }
      aiCalls++;
      return aiCalls === 1
        ? { response: "bad json" }
        : {
            response:
              '```json\n{"tasks":[{"title":"Купить молоко","date":"2026-10-25"}],"summary":"Добавлено"}\n```',
          };
    },
  };
  try {
    assert.equal(
      (await worker.fetch(req("/api/telegram/webhook", {}), env, c)).status,
      403,
    );
    const update = {
      update_id: 123,
      message: {
        from: { id: 42 },
        chat: { id: 42, type: "private" },
        voice: { file_id: "f", file_size: 3 },
      },
    };
    const headers = {
      "X-Telegram-Bot-Api-Secret-Token": await webhookSecret(env.BOT_TOKEN),
    };
    const r = await worker.fetch(
      req("/api/telegram/webhook", update, headers),
      env,
      c,
    );
    assert.equal(r.status, 200);
    assert.equal(c.promises.length, 1);
    await Promise.all(c.promises);
    const rows = (await env.DB.prepare("SELECT * FROM tasks").all()).results;
    assert.equal(rows.length, 1);
    assert.equal(rows[0].source, "voice");
    assert.equal(rows[0].user_id, "42");
    assert.equal(aiCalls, 2);
    assert.equal(
      sent[0].reply_markup.inline_keyboard[0][0].web_app.url,
      "http://localhost",
    );
    await worker.fetch(req("/api/telegram/webhook", update, headers), env, c);
    assert.equal(c.promises.length, 1);
  } finally {
    globalThis.fetch = original;
    env.DB.close();
  }
});
test("Notion setup creates database; cron exports, archives and advances revision cursor", async () => {
  const env = envFor(),
    c = ctx();
  const original = globalThis.fetch,
    calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({
      url: String(url),
      ...options,
      body: JSON.parse(options.body),
    });
    return Response.json({
      id: String(url).endsWith("databases") ? "db-1" : "page-1",
    });
  };
  try {
    await worker.fetch(req("/api/auth/local", {}), env, c);
    const r = await worker.fetch(
      req(
        "/api/notion/setup",
        {
          token: "secret-test",
          page: "https://notion.so/0123456789abcdef0123456789abcdef",
        },
        auth("1"),
      ),
      env,
      c,
    );
    assert.equal(r.status, 200);
    const u = await env.DB.prepare("SELECT * FROM users WHERE id=?")
      .bind("1")
      .first();
    assert(!u.notion.includes("secret-test"));
    await upsert(env.DB, "1", "tasks", [record("t")]);
    env.BOT_TOKEN = "";
    await scheduled(env);
    assert.equal(calls.length, 2);
    assert.equal(
      calls[1].body.properties["Задача"].title[0].text.content,
      "Task",
    );
    await scheduled(env);
    assert.equal(calls.length, 2);
    await upsert(env.DB, "1", "tasks", [
      { ...record("t", "Task", Date.now() + 1), deleted: true },
    ]);
    await scheduled(env);
    assert.equal(calls[2].method, "PATCH");
    assert.equal(calls[2].body.archived, true);
    assert.ok(
      (
        await env.DB.prepare("SELECT notion_cursor FROM users WHERE id=?")
          .bind("1")
          .first()
      ).notion_cursor > 0,
    );
  } finally {
    globalThis.fetch = original;
    env.DB.close();
  }
});
test("schema initialization is repeatable and migrates an old tasks table", async () => {
  const db = database();
  await db.exec(
    "CREATE TABLE tasks (id TEXT,user_id TEXT,PRIMARY KEY(user_id,id))",
  );
  await schema(db);
  await schema(db);
  await upsert(db, "1", "tasks", [record("a")]);
  assert.equal(
    (await db.prepare("SELECT title FROM tasks").first()).title,
    "Task",
  );
  db.close();
});

test("reminders are sent once for the scheduled Moscow day, completed habits are skipped", async () => {
  const env = envFor();
  await schema(env.DB);
  await env.DB.prepare("INSERT INTO users (id) VALUES (?)").bind("7").run();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Moscow",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (k) => parts.find((p) => p.type === k).value;
  const date = `${get("year")}-${get("month")}-${get("day")}`,
    reminder = `${get("hour")}:${get("minute")}`;
  await upsert(env.DB, "7", "items", [
    {
      id: "h1",
      kind: "habit",
      data: { title: "Вода", days: [0, 1, 2, 3, 4, 5, 6], reminder },
      updated_at: Date.now(),
    },
    {
      id: "h2",
      kind: "habit",
      data: { title: "Прогулка", days: [0, 1, 2, 3, 4, 5, 6], reminder },
      updated_at: Date.now(),
    },
    {
      id: `hl/h2:${date}`,
      kind: "habit_log",
      data: { habitId: "h2", date, done: true },
      updated_at: Date.now(),
    },
  ]);
  const original = globalThis.fetch;
  let sent = 0;
  globalThis.fetch = async () => {
    sent++;
    return Response.json({ ok: true, result: {} });
  };
  try {
    await scheduled(env);
    await scheduled(env);
    assert.equal(sent, 1);
  } finally {
    globalThis.fetch = original;
    env.DB.close();
  }
});

test("Notion cron bounds requests to 35 and resumes remaining tasks", async () => {
  const env = envFor();
  const original = globalThis.fetch;
  let pages = 0;
  globalThis.fetch = async (url) => {
    if (String(url).endsWith("databases")) return Response.json({ id: "db" });
    pages++;
    return Response.json({ id: `p${pages}` });
  };
  try {
    await worker.fetch(req("/api/auth/local", {}), env, ctx());
    await worker.fetch(
      req(
        "/api/notion/setup",
        { token: "notion-test", page: "0123456789abcdef0123456789abcdef" },
        auth("1"),
      ),
      env,
      ctx(),
    );
    await upsert(
      env.DB,
      "1",
      "tasks",
      Array.from({ length: 40 }, (_, i) => record(`bulk-${i}`)),
    );
    env.BOT_TOKEN = "";
    await scheduled(env);
    assert.equal(pages, 35);
    await scheduled(env);
    assert.equal(pages, 40);
  } finally {
    globalThis.fetch = original;
    env.DB.close();
  }
});

test("100-record push uses bounded SQL batches and unique monotonic revisions", async () => {
  const db = database();
  await schema(db);
  const prepare = db.prepare;
  let queries = 0;
  db.prepare = (q) => {
    queries++;
    const stmt = prepare(q);
    const bind = stmt.bind;
    stmt.bind = (...args) => {
      assert(args.length <= 100);
      return bind(...args);
    };
    return stmt;
  };
  const rows = await upsert(
    db,
    "bulk",
    "tasks",
    Array.from({ length: 100 }, (_, i) => record(`r${i}`)),
  );
  assert.equal(rows.length, 100);
  assert.equal(new Set(rows.map((r) => r.rev)).size, 100);
  assert(queries < 40);
  db.close();
});
