import { create } from "zustand";
import { persist } from "zustand/middleware";
import { uid, dateKey, addDays, nextRepeat } from "./logic";
const defaults = {
  theme: "auto",
  start: "09:00",
  end: "19:00",
  peak: "10:00",
  headLimit: 4,
};
export const useStore = create(
  persist(
    (set, get) => ({
      tasks: [],
      items: [],
      key: "",
      user: "",
      demo: false,
      onboarded: false,
      cursors: { tasks: 0, items: 0 },
      status: "Локально",
      lastSync: null,
      timers: [],
      settings: () => ({
        ...defaults,
        ...get().items.find((i) => i.kind === "settings" && !i.deleted)?.data,
      }),
      putTask: (data) => {
        const old = get().tasks.find((t) => t.id === data.id);
        const row = {
          ...old,
          ...data,
          id: data.id || uid(),
          updated_at: Math.max(Date.now(), (old?.updated_at || 0) + 1),
          created_at: old?.created_at || Date.now(),
          dirty: true,
        };
        set({ tasks: [...get().tasks.filter((t) => t.id !== row.id), row] });
        return row;
      },
      putItem: (kind, data, id) => {
        id = id || uid();
        const old = get().items.find((i) => i.id === id);
        const row = {
          ...old,
          id,
          kind,
          data,
          deleted: false,
          updated_at: Math.max(Date.now(), (old?.updated_at || 0) + 1),
          dirty: true,
        };
        set({ items: [...get().items.filter((i) => i.id !== id), row] });
        return row;
      },
      deleteItem: (id) => {
        set({
          items: get().items.map((i) =>
            i.id === id
              ? {
                  ...i,
                  deleted: true,
                  dirty: true,
                  updated_at: Math.max(Date.now(), i.updated_at + 1),
                }
              : i,
          ),
        });
      },
      complete: (id) => {
        const t = get().tasks.find((t) => t.id === id);
        get().putTask({ ...t, done: !t.done });
        if (!t.done) {
          const next = nextRepeat(t);
          if (next && !get().tasks.some((t) => t.id === next.id))
            get().putTask(next);
        }
      },
      setting: (key, value) => {
        const s = get().settings();
        get().putItem("settings", { ...s, [key]: value }, "settings");
      },
      habitToggle: (id, date) => {
        const key = `hl/${id}:${date}`;
        const old = get().items.find((i) => i.id === key);
        get().putItem(
          "habit_log",
          { habitId: id, date, done: !old?.data.done },
          key,
        );
      },
      connect: (key, user = "") => {
        set({
          key: key.trim(),
          user,
          tasks: [],
          items: [],
          demo: false,
          cursors: { tasks: 0, items: 0 },
          status: "Подключение…",
        });
        sync();
      },
      disconnect: () =>
        set({
          key: "",
          user: "",
          tasks: [],
          items: [],
          timers: [],
          demo: false,
          cursors: { tasks: 0, items: 0 },
          status: "Локально",
        }),
      demoData: () => {
        if (get().key || get().tasks.length) return;
        const today = dateKey();
        const task = (title, time, duration_min, area, extra = {}) => ({
          id: uid(),
          title,
          time,
          duration_min,
          area,
          date: today,
          priority: 2,
          slot: "anytime",
          checklist: [],
          repeat: null,
          done: false,
          deleted: false,
          note: "",
          created_at: Date.now(),
          updated_at: Date.now(),
          ...extra,
        });
        set({
          demo: true,
          tasks: [
            task("Продумать концепцию нового проекта", "10:00", 90, "работа", {
              frog: true,
              deep: true,
              note: "Начать с самого важного. Три идеи — уже хороший результат.",
            }),
            task("Почта и короткие ответы", "09:00", 20, "работа", {
              done: true,
            }),
            task("Прогулка без телефона", "12:00", 30, "здоровье"),
            task("Созвон с командой", "15:00", 45, "работа"),
            task("Почитать 20 страниц", "", 25, "для себя"),
            task("Забрать заказ", "", 15, "быт"),
            task("Разобрать фотографии", "", 30, "для себя", {
              date: addDays(today, -2),
            }),
            task("Идея: маленькое путешествие", "", 60, "для себя", {
              date: null,
            }),
          ],
          items: [
            {
              id: "demo-h1",
              kind: "habit",
              data: {
                title: "Стакан воды утром",
                days: [0, 1, 2, 3, 4, 5, 6],
                reminder: "09:00",
              },
            },
            {
              id: "demo-h2",
              kind: "habit",
              data: { title: "10 минут тишины", days: [0, 1, 2, 3, 4, 5, 6] },
            },
            {
              id: "demo-a1",
              kind: "area",
              data: { title: "работа", hours: 25 },
            },
            {
              id: "demo-a2",
              kind: "area",
              data: { title: "здоровье", hours: 5 },
            },
            {
              id: "demo-a3",
              kind: "area",
              data: { title: "для себя", hours: 4 },
            },
            { id: "demo-cycle", kind: "plan", data: { start: today } },
            {
              id: "demo-goal",
              kind: "goal",
              data: { title: "Сделать движение частью жизни" },
            },
            {
              id: "demo-tactic",
              kind: "tactic",
              data: {
                title: "Две прогулки по 30 минут",
                goal: "demo-goal",
                week: 1,
              },
            },
            {
              id: "demo-note",
              kind: "note",
              data: {
                title: "Не забывать про главное",
                text: "Хороший день — не тот, в котором сделано всё. А тот, в котором нашлось место важному.",
              },
            },
          ].map((i) => ({ ...i, updated_at: Date.now(), deleted: false })),
        });
      },
      addTimer: (title, mins) =>
        set({
          timers: [
            ...get().timers,
            { id: uid(), title, end: Date.now() + mins * 60000 },
          ],
        }),
      removeTimer: (id) =>
        set({ timers: get().timers.filter((t) => t.id !== id) }),
    }),
    {
      name: "tiho-planner-v1",
      partialize: (s) =>
        Object.fromEntries(
          Object.entries(s).filter(
            ([k, v]) => typeof v !== "function" && !["status"].includes(k),
          ),
        ),
    },
  ),
);
let running = false;
export async function api(path, body, headers = {}) {
  const r = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${useStore.getState().key}`,
      ...headers,
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  if (!r.ok) throw Error(data.error || `HTTP ${r.status}`);
  return data;
}
export async function sync() {
  const s = useStore.getState();
  if (running || !s.key || s.demo) return;
  running = true;
  useStore.setState({ status: "Синхронизация…" });
  try {
    for (const table of ["tasks", "items"]) {
      const dirty = useStore.getState()[table].filter((r) => r.dirty);
      for (let n = 0; n < dirty.length; n += 100) {
        const sent = dirty.slice(n, n + 100);
        const data = await api(
          `/api/${table}/sync`,
          { records: sent },
          { Authorization: `Bearer ${s.key}` },
        );
        if (useStore.getState().key !== s.key) return;
        useStore.setState((state) => ({
          [table]: state[table].map((local) => {
            const remote = data.records.find((r) => r.id === local.id);
            const original = sent.find((r) => r.id === local.id);
            if (!remote || local.updated_at !== original.updated_at)
              return local;
            return { ...remote, dirty: false };
          }),
        }));
      }
      let more = true;
      while (more) {
        const cursor = useStore.getState().cursors[table];
        const data = await api(`/api/${table}/sync?since=${cursor}`, null, {
          Authorization: `Bearer ${s.key}`,
        });
        if (useStore.getState().key !== s.key) return;
        useStore.setState((state) => {
          const map = new Map(state[table].map((r) => [r.id, r]));
          for (const r of data.records) {
            const local = map.get(r.id);
            if (!local || !local.dirty || r.updated_at > local.updated_at)
              map.set(r.id, { ...r, dirty: false });
          }
          return {
            [table]: [...map.values()],
            cursors: { ...state.cursors, [table]: data.cursor },
          };
        });
        more = data.hasMore;
      }
    }
    useStore.setState({ status: "Синхронизировано", lastSync: Date.now() });
  } catch (e) {
    useStore.setState({
      status: navigator.onLine ? e.message : "Офлайн · изменения сохранены",
    });
  } finally {
    running = false;
    if (useStore.getState().key && useStore.getState().key !== s.key)
      queueMicrotask(sync);
  }
}
let debounce;
useStore.subscribe((state, prev) => {
  if (
    (state.tasks !== prev.tasks || state.items !== prev.items) &&
    (state.tasks.some((r) => r.dirty) || state.items.some((r) => r.dirty))
  ) {
    clearTimeout(debounce);
    debounce = setTimeout(sync, 1000);
  }
});
window.addEventListener("focus", sync);
window.addEventListener("online", sync);
setInterval(sync, 30000);
