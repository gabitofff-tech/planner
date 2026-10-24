import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const auth = await (
  await fetch("http://localhost:8787/api/auth/local", {
    method: "POST",
    body: "{}",
  })
).json();
assert.ok(auth.key);
const contexts = [];
async function device() {
  const c = await browser.newContext();
  contexts.push(c);
  await c.route("https://telegram.org/**", (r) => r.abort());
  await c.addInitScript((key) => {
    if (!localStorage.getItem("tiho-planner-v1"))
      localStorage.setItem(
        "tiho-planner-v1",
        JSON.stringify({
          state: {
            key,
            onboarded: true,
            tasks: [],
            items: [],
            cursors: { tasks: 0, items: 0 },
          },
          version: 0,
        }),
      );
  }, auth.key);
  const p = await c.newPage();
  p.on("pageerror", (e) => console.log("BROWSER ERROR", e.message));
  await p.goto("http://localhost:8787");
  await p.locator(".now-card").waitFor();
  await p.evaluate(() => navigator.serviceWorker.ready);
  return { c, p };
}
try {
  const a = await device(),
    b = await device();
  const title = `Обмен ${Date.now()}`;
  await a.p
    .getByRole("textbox", { name: "Быстрый ввод" })
    .fill(title + " 20 мин");
  await a.p.getByRole("textbox", { name: "Быстрый ввод" }).press("Enter");
  await a.p.waitForFunction(
    (title) =>
      JSON.parse(localStorage.getItem("tiho-planner-v1")).state.tasks.some(
        (t) => !t.dirty && t.title === title,
      ),
    title,
  );
  await b.p.waitForFunction(
    () => document.querySelector(".sync-status")?.title === "Синхронизировано",
  );
  await b.p.evaluate(() => window.dispatchEvent(new Event("focus")));
  await b.p.getByText(title, { exact: true }).last().waitFor();
  await b.c.setOffline(true);
  await b.p.locator(".task-body").filter({ hasText: title }).click();
  await b.p
    .getByRole("textbox", { name: "Название", exact: true })
    .fill(title + " офлайн");
  await b.p.getByRole("button", { name: "Сохранить", exact: true }).click();
  await b.p.reload();
  await b.p
    .getByText(title + " офлайн", { exact: true })
    .last()
    .waitFor();
  console.log("offline reload passed");
  await b.c.setOffline(false);
  await b.p.evaluate(() => window.dispatchEvent(new Event("online")));
  await b.p.waitForFunction(
    (title) =>
      JSON.parse(localStorage.getItem("tiho-planner-v1")).state.tasks.some(
        (t) => t.title === title && !t.dirty,
      ),
    title + " офлайн",
  );
  await a.p.evaluate(() => window.dispatchEvent(new Event("focus")));
  await a.p
    .getByText(title + " офлайн", { exact: true })
    .last()
    .waitFor();
  await a.p
    .locator(".task-body")
    .filter({ hasText: title + " офлайн" })
    .click();
  await a.p.getByRole("button", { name: "Удалить", exact: true }).click();
  await a.p.waitForFunction(
    (title) =>
      JSON.parse(localStorage.getItem("tiho-planner-v1")).state.tasks.some(
        (t) => t.title === title && t.deleted && !t.dirty,
      ),
    title + " офлайн",
  );
  await b.p.waitForFunction(
    () => document.querySelector(".sync-status")?.title === "Синхронизировано",
  );
  await b.p.evaluate(() => window.dispatchEvent(new Event("focus")));
  await b.p.waitForFunction(
    (title) =>
      JSON.parse(localStorage.getItem("tiho-planner-v1")).state.tasks.some(
        (t) => t.title === title && t.deleted,
      ),
    title + " офлайн",
  );
  console.log(
    "Two-device sync, offline editing + reload, reconnect and tombstone propagation passed.",
  );
} finally {
  await Promise.all(contexts.map((c) => c.close()));
  await browser.close();
}
