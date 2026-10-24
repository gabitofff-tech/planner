import { chromium } from "@playwright/test";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  headless: true,
  args: ["--no-sandbox"],
});
await fs.mkdir("screenshots", { recursive: true });
const errors = [],
  report = [];
try {
  for (const width of [390, 1440])
    for (const theme of ["light", "dark"]) {
      const context = await browser.newContext({
        viewport: { width, height: width === 390 ? 844 : 1000 },
        colorScheme: theme,
      });
      const page = await context.newPage();
      page.on("pageerror", (e) => errors.push(e.message));
      await page.route("https://telegram.org/**", (r) => r.abort());
      const shot = async (name) => {
        await page.evaluate(() => document.fonts.ready);
        await page.locator(".toast").waitFor({ state: "hidden" });
        await page.screenshot({
          path: `screenshots/${width}-${theme}-${name}.png`,
          fullPage: !(await page.locator(".overlay").count()),
        });
        const overflow = await page.evaluate(() => ({
          width: innerWidth,
          scroll: document.documentElement.scrollWidth,
          offenders: [...document.querySelectorAll("main *, .dock, .sheet *")]
            .filter((e) => {
              const r = e.getBoundingClientRect();
              return r.width > 0 && (r.right > innerWidth + 2 || r.left < -2);
            })
            .slice(0, 10)
            .map((e) => ({
              tag: e.tagName,
              cls: e.className,
              text: e.textContent.slice(0, 80),
            })),
        }));
        report.push({ width, theme, name, overflow });
        assert(
          overflow.scroll <= width + 2,
          JSON.stringify({ name, overflow }),
        );
        assert.equal(
          overflow.offenders.length,
          0,
          JSON.stringify({ name, overflow }),
        );
      };
      await page.goto("http://localhost:8787");
      for (let i = 0; i < 3; i++) {
        await shot(`onboarding-${i + 1}`);
        await page.getByRole("button", { name: "Продолжить →" }).click();
      }
      await shot("onboarding-4");
      await page.getByRole("button", { name: "Посмотреть пример" }).click();
      await page.evaluate((theme) => {
        const data = JSON.parse(localStorage.getItem("tiho-planner-v1"));
        data.state.items.push({
          id: "settings",
          kind: "settings",
          data: { theme },
          updated_at: Date.now(),
        });
        localStorage.setItem("tiho-planner-v1", JSON.stringify(data));
      }, theme);
      await page.reload();
      await page.locator(".now-card").waitFor();
      const nav = async (name) =>
        page
          .locator(width === 390 ? ".dock" : ".sidebar nav")
          .getByRole("button", { name, exact: true })
          .click();
      await shot("today");
      await page.getByRole("button", { name: "✧ Спланировать день" }).click();
      await page
        .getByRole("button", { name: "Предпросмотр", exact: true })
        .click();
      await shot("autoplan");
      const before = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("tiho-planner-v1")).state.tasks.map(
          (t) => [t.id, t.time],
        ),
      );
      await page
        .getByRole("button", { name: "Применить", exact: true })
        .click();
      await page
        .getByRole("button", { name: "↶ Отменить автоплан", exact: true })
        .click();
      const after = await page.evaluate(() =>
        JSON.parse(localStorage.getItem("tiho-planner-v1")).state.tasks.map(
          (t) => [t.id, t.time],
        ),
      );
      assert.deepEqual(after.sort(), before.sort());
      await page.getByRole("button", { name: "Закрыть", exact: true }).click();
      await page.getByRole("button", { name: /Завершить день/ }).click();
      await shot("day-review");
      await page.getByRole("button", { name: "Дальше →" }).click();
      await shot("day-mood");
      await page.getByRole("button", { name: "Дальше →" }).click();
      await shot("day-journal");
      await page.getByRole("button", { name: "Закрыть", exact: true }).click();
      await nav("Планы");
      for (const tab of ["Входящие", "Неделя", "Месяц"]) {
        await page
          .locator(".tabs")
          .getByRole("button", { name: tab, exact: true })
          .click();
        await shot(
          "plans-" + { Входящие: "inbox", Неделя: "week", Месяц: "month" }[tab],
        );
      }
      await nav("Рост");
      for (const tab of ["Привычки", "Сферы", "12 недель"]) {
        await page
          .locator(".tabs")
          .getByRole("button", { name: tab, exact: true })
          .click();
        await shot(
          "growth-" +
            { Привычки: "habits", Сферы: "areas", "12 недель": "cycle" }[tab],
        );
      }
      await page.getByRole("button", { name: "＋ Цель", exact: true }).click();
      await shot("goal");
      await page.getByRole("button", { name: "Закрыть", exact: true }).click();
      await page.getByRole("button", { name: "＋ Шаг", exact: true }).click();
      await shot("tactic");
      await page.getByRole("button", { name: "Закрыть", exact: true }).click();
      await page
        .locator(".tabs")
        .getByRole("button", { name: "Сферы", exact: true })
        .click();
      await page
        .getByRole("button", { name: "＋ Добавить сферу", exact: true })
        .click();
      await shot("area");
      await page.getByRole("button", { name: "Закрыть", exact: true }).click();
      await nav("Ещё");
      for (const tab of ["Таймеры", "Заметки", "Данные", "Настройки"]) {
        await page
          .locator(".tabs")
          .first()
          .getByRole("button", { name: tab, exact: true })
          .click();
        await shot(
          "more-" +
            {
              Таймеры: "timers",
              Заметки: "notes",
              Данные: "data",
              Настройки: "settings",
            }[tab],
        );
      }
      if (width === 390)
        await page
          .locator(".dock")
          .getByRole("button", { name: "Добавить", exact: true })
          .click();
      else
        await page
          .getByRole("button", { name: "＋ Добавить", exact: true })
          .click();
      await shot("add");
      await page
        .locator(".add-options")
        .getByRole("button", { name: /Задача/ })
        .click();
      await shot("task");
      await page
        .locator(".sheet")
        .evaluate((e) => (e.scrollTop = e.scrollHeight));
      await shot("task-bottom");
      await page.getByRole("button", { name: "Закрыть", exact: true }).click();
      for (const [label, name] of [
        ["Привычка", "habit"],
        ["Заметка", "note"],
        ["Таймер", "timer"],
      ]) {
        await page
          .locator(width === 390 ? ".dock .dock-add" : ".add-desktop")
          .click();
        await page
          .locator(".add-options")
          .getByRole("button", { name: new RegExp(label) })
          .click();
        await shot(name);
        await page
          .getByRole("button", { name: "Закрыть", exact: true })
          .click();
      }
      await page.getByRole("button", { name: "Поиск", exact: true }).click();
      await shot("search");
      await page.getByRole("button", { name: "Закрыть", exact: true }).click();
      await nav("Сегодня");
      const input = page.getByRole("textbox", { name: "Быстрый ввод" });
      await input.fill(
        "Тест длинного названия задачи без обрезания текста и горизонтального скролла 20 мин #работа",
      );
      await input.press("Enter");
      assert.ok(
        (
          await page.evaluate(
            () =>
              JSON.parse(localStorage.getItem("tiho-planner-v1")).state.tasks,
          )
        ).some((t) => t.title.startsWith("Тест длинного")),
      );
      await shot("long-task");
      await context.close();
    }
} finally {
  await fs.writeFile(
    "screenshots/report.json",
    JSON.stringify({ report, errors }, null, 2),
  );
  await browser.close();
}
assert.equal(errors.length, 0, errors.join("\n"));
console.log(
  `${report.length} screenshots checked; no horizontal overflow or browser errors.`,
);
