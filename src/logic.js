export const uid = () => crypto.randomUUID();
export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
export function addDays(key, n) {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + n);
  return dateKey(d);
}
export const minutes = (t) => {
  const [h, m] = (t || "00:00").split(":").map(Number);
  return h * 60 + m;
};
export const timeString = (n) =>
  `${String(Math.floor(n / 60)).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}`;
export function parseInput(input, today = dateKey()) {
  let title = input.trim(),
    date = today,
    time = "",
    duration_min = 30,
    slot = "anytime",
    area = "",
    priority = 2,
    frog = false;
  const take = (re, fn) => {
    title = title.replace(re, (...args) => {
      fn(...args);
      return " ";
    });
  };
  take(
    /(?:^|\s)(\d+(?:[.,]\d+)?)\s*(часов|часа|час|минуты|минут|минута|мин|ч)(?=\s|$)/iu,
    (_, n, u) => {
      duration_min = Math.round(
        Number(n.replace(",", ".")) * (u.startsWith("ч") ? 60 : 1),
      );
    },
  );
  take(/(?:^|\s)(?:в\s+)?([01]?\d|2[0-3]):([0-5]\d)(?=\s|$)/u, (_, h, m) => {
    time = `${h.padStart(2, "0")}:${m}`;
  });
  take(/(?:^|\s)(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?(?=\s|$)/u, (_, d, m, y) => {
    const k = `${y || today.slice(0, 4)}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
    if (dateKey(new Date(k + "T12:00:00")) === k) date = k;
  });
  take(/послезавтра/iu, () => (date = addDays(today, 2)));
  take(/завтра/iu, () => (date = addDays(today, 1)));
  take(/сегодня/iu, () => (date = today));
  const weekdays = [
    "воскресенье",
    "понедельник",
    "вторник",
    "сред(?:а|у)",
    "четверг",
    "пятниц(?:а|у)",
    "суббот(?:а|у)",
  ];
  weekdays.forEach((w, i) =>
    take(new RegExp(`(?:в\\s+)?${w}`, "iu"), () => {
      const n = new Date(today + "T12:00:00").getDay();
      date = addDays(today, (i - n + 7) % 7 || 7);
    }),
  );
  take(/утром/iu, () => (slot = "morning"));
  take(/дн[её]м/iu, () => (slot = "afternoon"));
  take(/вечером/iu, () => (slot = "evening"));
  take(/#([\p{L}\d_-]+)/u, (_, a) => (area = a));
  take(/\/!/u, () => {
    frog = true;
    priority = 1;
  });
  take(/!/u, () => (priority = 1));
  take(/~/u, () => (priority = 3));
  title = title.replace(/\s+/g, " ").trim();
  return {
    title: title || "Новая задача",
    date,
    time,
    duration_min: Math.max(5, Math.min(1440, duration_min)),
    slot,
    area,
    priority,
    frog,
    deep: false,
    note: "",
    repeat: null,
    checklist: [],
    done: false,
    deleted: false,
    source: "app",
  };
}
export function nextRepeat(task) {
  if (!task.repeat || !task.date) return null;
  const r = task.repeat;
  let d = addDays(task.date, 1);
  if (r.type === "month") {
    const original = new Date(task.date + "T12:00:00");
    const next = new Date(original.getFullYear(), original.getMonth() + 2, 0);
    next.setDate(Math.min(original.getDate(), next.getDate()));
    d = dateKey(next);
  } else if (r.type === "weekdays" || r.type === "days") {
    const days = r.type === "weekdays" ? [1, 2, 3, 4, 5] : r.days;
    if (!days?.length) return null;
    while (!days.includes(new Date(d + "T12:00:00").getDay()))
      d = addDays(d, 1);
  }
  return {
    ...task,
    id: `repeat/${r.root || task.id}/${d}`,
    repeat: { ...r, root: r.root || task.id },
    date: d,
    done: false,
    deleted: false,
    checklist: (task.checklist || []).map((c) => ({ ...c, done: false })),
  };
}
export const points = (t) =>
  t.frog ? 40 : t.duration_min <= 30 ? 10 : t.duration_min <= 90 ? 25 : 30;
export function workload(tasks, settings = {}) {
  const open = tasks.filter((t) => !t.done && !t.deleted);
  return {
    time: open.reduce((s, t) => s + t.duration_min, 0) * 1.5,
    capacity:
      (minutes(settings.end || "19:00") - minutes(settings.start || "09:00")) *
      0.65,
    head:
      open
        .filter((t) => t.deep || t.frog)
        .reduce((s, t) => s + t.duration_min, 0) / 60,
    headCapacity: Number(settings.headLimit || 4),
  };
}
export function autoPlan(tasks, settings = {}) {
  const start = minutes(settings.start || "09:00"),
    end = minutes(settings.end || "19:00"),
    peak = minutes(settings.peak || "10:00");
  const fixed = tasks.filter((t) => t.time && !t.done && !t.deleted);
  const occupied = fixed.map((t) => [
    minutes(t.time),
    minutes(t.time) + t.duration_min + 10,
  ]);
  occupied.push([13 * 60, 14 * 60]);
  const result = [];
  for (const t of tasks
    .filter((t) => !t.time && !t.done && !t.deleted)
    .sort(
      (a, b) =>
        Number(b.frog || b.deep) - Number(a.frog || a.deep) ||
        a.priority - b.priority,
    )) {
    let at =
      t.frog || t.deep ? Math.max(start, peak) : Math.max(start, peak + 120);
    const fits = (n) =>
      n >= start &&
      n + t.duration_min <= end &&
      !occupied.some(([a, b]) => n < b && n + t.duration_min > a);
    while (at < end && !fits(at)) at += 5;
    if (!fits(at)) {
      at = start;
      while (at < end && !fits(at)) at += 5;
    }
    if (fits(at)) {
      occupied.push([at, at + t.duration_min + 10]);
      result.push({ ...t, time: timeString(at) });
    }
  }
  return result;
}
export function monthExport(tasks, items, month) {
  return {
    version: 1,
    month,
    tasks: tasks.filter((t) => !t.deleted && t.date?.startsWith(month)),
    items: items.filter(
      (i) =>
        !i.deleted &&
        ((i.kind !== "habit_log" && i.kind !== "day") ||
          i.data.date?.startsWith(month)),
    ),
  };
}
export const exportPrompt =
  "Ты — внимательный помощник по планированию. Разбери мой месяц: нагрузку, баланс сфер, привычки и энергию. Отметь успехи без оценок личности. Предложи три небольших изменения на следующий месяц. Данные:\n";
export function habitStats(habit, logs, today = dateKey()) {
  const dates = new Set(
    logs
      .filter((l) => !l.deleted && l.data.habitId === habit.id && l.data.done)
      .map((l) => l.data.date),
  );
  const scheduled = (d) =>
    (habit.data.days || [0, 1, 2, 3, 4, 5, 6]).includes(
      new Date(d + "T12:00:00").getDay(),
    );
  let streak = 0;
  for (let i = 0; i < 366; i++) {
    const d = addDays(today, -i);
    if (!scheduled(d)) continue;
    if (dates.has(d)) streak++;
    else if (i !== 0) break;
  }
  let total = 0,
    done = 0;
  for (let d = today.slice(0, 7) + "-01"; d <= today; d = addDays(d, 1)) {
    if (scheduled(d)) {
      total++;
      if (dates.has(d)) done++;
    }
  }
  return { streak, percent: total ? Math.round((done / total) * 100) : 0 };
}

export function dayStreak(tasks, today = dateKey()) {
  const dates = new Set(
    tasks.filter((t) => t.done && !t.deleted).map((t) => t.date),
  );
  let n = 0,
    d = dates.has(today) ? today : addDays(today, -1);
  while (dates.has(d)) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}
