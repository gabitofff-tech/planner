import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseInput,
  autoPlan,
  nextRepeat,
  points,
  monthExport,
  workload,
  habitStats,
} from "../src/logic.js";
test("Russian quick input: time, decimal hours, tomorrow, area and importance", () => {
  const t = parseInput("созвон 1.5ч в 16:00 завтра #работа !", "2026-10-24");
  assert.equal(t.title, "созвон");
  assert.equal(t.duration_min, 90);
  assert.equal(t.date, "2026-10-25");
  assert.equal(t.time, "16:00");
  assert.equal(t.area, "работа");
  assert.equal(t.priority, 1);
  assert.equal(
    parseInput("прогулка в парке в 16:00").title,
    "прогулка в парке",
  );
});
test("dot format is date, slots and main marker", () => {
  const t = parseInput("отчёт 20.10 утром /!", "2026-10-01");
  assert.equal(t.date, "2026-10-20");
  assert.equal(t.time, "");
  assert.equal(t.slot, "morning");
  assert.equal(t.frog, true);
  assert.equal(
    parseInput("йога в среду 20 мин ~", "2026-10-26").date,
    "2026-10-28",
  );
});
test("planner preserves lunch, fixed blocks and breaks", () => {
  const ts = [
    { id: "fixed", time: "10:00", duration_min: 60 },
    { id: "main", frog: true, duration_min: 90, priority: 1 },
    { id: "small", duration_min: 20, priority: 2 },
    { id: "too-long", duration_min: 900, priority: 3 },
  ];
  const plan = autoPlan(ts);
  assert.equal(plan.length, 2);
  assert.equal(plan.find((t) => t.id === "main").time, "11:10");
  assert.equal(plan.find((t) => t.id === "small").time, "14:00");
  assert(!plan.some((t) => t.id === "fixed"));
});
test("repeat weekdays, selected days, short month and checklist reset", () => {
  const t = {
    id: "1",
    date: "2026-01-30",
    repeat: { type: "weekdays" },
    checklist: [{ done: true }],
  };
  assert.equal(nextRepeat(t).date, "2026-02-02");
  assert.equal(
    nextRepeat({ ...t, date: "2026-01-31", repeat: { type: "month" } }).date,
    "2026-02-28",
  );
  assert.equal(
    nextRepeat({ ...t, repeat: { type: "days", days: [0] } }).date,
    "2026-02-01",
  );
  assert.equal(nextRepeat(t).checklist[0].done, false);
});
test("points, capacity and export exclude tombstones and other months", () => {
  assert.deepEqual(
    [20, 60, 100].map((duration_min) => points({ duration_min })),
    [10, 25, 30],
  );
  assert.equal(points({ frog: true, duration_min: 10 }), 40);
  const l = workload([{ duration_min: 60, deep: true }]);
  assert.equal(l.time, 90);
  assert.equal(l.head, 1);
  assert.equal(l.capacity, 390);
  assert.equal(
    monthExport(
      [
        { date: "2026-10-01" },
        { date: "2026-09-01" },
        { date: "2026-10-02", deleted: true },
      ],
      [],
      "2026-10",
    ).tasks.length,
    1,
  );
});
test("habit streak follows scheduled weekdays", () => {
  const h = { id: "a", data: { days: [1, 3, 5] } };
  const logs = ["2026-10-23", "2026-10-21", "2026-10-19"].map((date) => ({
    data: { habitId: "a", date, done: true },
  }));
  assert.equal(habitStats(h, logs, "2026-10-24").streak, 3);
});

test("repeat identifiers remain bounded across a year of daily completions", () => {
  let t = { id: "root", date: "2026-01-01", repeat: { type: "daily" } };
  for (let i = 0; i < 365; i++) {
    t = nextRepeat(t);
    assert(t.id.length < 60);
  }
  assert.equal(t.date, "2027-01-01");
});
