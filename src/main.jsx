import React, { useEffect, useState, useContext, createContext } from "react";
import { createRoot } from "react-dom/client";
import "@fontsource/golos-text/400.css";
import "@fontsource/golos-text/500.css";
import "@fontsource/golos-text/600.css";
import "@fontsource/golos-text/700.css";
import { useStore, api, sync } from "./store";
import {
  dateKey,
  addDays,
  parseInput,
  minutes,
  timeString,
  workload,
  autoPlan,
  points,
  monthExport,
  exportPrompt,
  habitStats,
  dayStreak,
  uid,
} from "./logic";
import "./style.css";
const labels = {
  today: "Сегодня",
  plans: "Планы",
  growth: "Рост",
  more: "Ещё",
};
const icons = { today: "◷", plans: "▦", growth: "→", more: "•••" };
const pretty = (d, opts = { day: "numeric", month: "long" }) =>
  new Date(d + "T12:00:00").toLocaleDateString("ru-RU", opts);
const duration = (n) =>
  n >= 60
    ? `${Math.floor(n / 60)} ч${n % 60 ? ` ${n % 60} мин` : ""}`
    : `${n} мин`;
const dayNames = ["Вс", "Пн", "Вт", "Ср", "Чт", "Пт", "Сб"];
const AppContext = createContext(null);
function App() {
  const s = useStore();
  const [page, setPage] = useState("today"),
    [tab, setTab] = useState(""),
    [date, setDate] = useState(dateKey()),
    [sheet, setSheet] = useState(null),
    [toast, setToast] = useState(""),
    [query, setQuery] = useState(""),
    [now, setNow] = useState(Date.now());
  const settings = s.settings();
  const tasks = s.tasks.filter((t) => !t.deleted),
    items = s.items.filter((i) => !i.deleted);
  const todayTasks = tasks.filter((t) => t.date === date);
  const habits = items.filter((i) => i.kind === "habit");
  const tell = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 4500);
  };
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 30000);
    const key = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSheet({ type: "search" });
      }
      if (e.key === "Escape") setSheet(null);
    };
    window.addEventListener("keydown", key);
    const tg = window.Telegram?.WebApp;
    tg?.ready();
    tg?.expand();
    if (tg?.initData)
      api("/api/auth/telegram", { initData: tg.initData })
        .then((r) => {
          if (useStore.getState().key !== r.key)
            useStore.getState().connect(r.key, r.user);
          else sync();
        })
        .catch((e) => tell(e.message));
    else sync();
    if ("serviceWorker" in navigator && import.meta.env.PROD)
      navigator.serviceWorker.register("/sw.js");
    return () => {
      clearInterval(tick);
      window.removeEventListener("keydown", key);
    };
  }, []);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)"),
      tg = window.Telegram?.WebApp;
    const apply = () =>
      (document.documentElement.dataset.theme =
        settings.theme === "auto"
          ? tg?.initData
            ? tg.colorScheme
            : media.matches
              ? "dark"
              : "light"
          : settings.theme);
    apply();
    media.addEventListener("change", apply);
    tg?.onEvent?.("themeChanged", apply);
    return () => {
      media.removeEventListener("change", apply);
      tg?.offEvent?.("themeChanged", apply);
    };
  }, [settings.theme]);
  const nav = (p) => {
    setPage(p);
    setTab("");
  };
  const edit = (t) => setSheet({ type: "task", task: t });
  const focus = (t) => {
    s.addTimer(t.title, 25);
    tell("Фокус начался · 25 минут");
  };
  const next =
    todayTasks
      .filter((t) => !t.done)
      .sort((a, b) => (a.time || "99:99").localeCompare(b.time || "99:99"))
      .find(
        (t) =>
          !t.time ||
          minutes(t.time) + t.duration_min >=
            new Date(now).getHours() * 60 + new Date(now).getMinutes(),
      ) || todayTasks.find((t) => !t.done);
  return (
    <AppContext.Provider
      value={{
        s,
        page,
        setPage,
        tab,
        setTab,
        date,
        setDate,
        sheet,
        setSheet,
        toast,
        setToast,
        query,
        setQuery,
        now,
        settings,
        tasks,
        items,
        todayTasks,
        habits,
        tell,
        nav,
        edit,
        focus,
        next,
      }}
    >
      <div className="app">
        <aside className="sidebar">
          <a
            className="brand"
            href="#"
            onClick={(e) => {
              e.preventDefault();
              nav("today");
            }}
          >
            <span className="brand-icon">✓</span>тихо
            <span className="brand-period">.</span>
          </a>
          <p className="brand-caption">Планер в вашем ритме</p>
          <nav>
            {Object.keys(labels).map((p) => (
              <button
                key={p}
                aria-label={labels[p]}
                className={page === p ? "active" : ""}
                onClick={() => nav(p)}
              >
                <span>{icons[p]}</span>
                {labels[p]}
              </button>
            ))}
          </nav>
          <button
            className="primary add-desktop"
            onClick={() => setSheet({ type: "add" })}
          >
            ＋ Добавить
          </button>
          <div className="sidebar-bottom">
            <span className="little-flower">✳</span>
            <p>
              Не больше дел.
              <br />
              Больше смысла.
            </p>
            <small>Сделано для спокойных дней</small>
          </div>
        </aside>
        <main>
          <header className="topbar">
            <span>
              {pretty(dateKey(), {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </span>
            <div>
              <span className="sync-status" title={s.status}>
                <i />
                {s.demo
                  ? "Демо · только на устройстве"
                  : s.key
                    ? s.status
                    : "Сохранено на устройстве"}
              </span>
              <button
                className="search-button"
                aria-label="Поиск"
                onClick={() => setSheet({ type: "search" })}
              >
                ⌕ <kbd>⌘ K</kbd>
              </button>
              <button
                className="avatar"
                onClick={() => {
                  nav("more");
                  setTab("Настройки");
                }}
              >
                Я
              </button>
            </div>
          </header>
          <div className="page-content">
            {page === "today" ? (
              <Today />
            ) : page === "plans" ? (
              <Plans />
            ) : page === "growth" ? (
              <Growth />
            ) : (
              <More />
            )}
          </div>
          <footer>Ваш день. Ваш темп.</footer>
        </main>
        <nav className="dock">
          {["today", "plans", "add", "growth", "more"].map((p) => (
            <button
              key={p}
              aria-label={p === "add" ? "Добавить" : labels[p]}
              className={`${p === "add" ? "dock-add" : ""} ${page === p ? "active" : ""}`}
              onClick={() => (p === "add" ? setSheet({ type: "add" }) : nav(p))}
            >
              <span>{p === "add" ? "+" : icons[p]}</span>
              {p !== "add" && <small>{labels[p]}</small>}
            </button>
          ))}
        </nav>
        {s.timers.length > 0 && (
          <button
            className="timer-float"
            onClick={() => {
              nav("more");
              setTab("Таймеры");
            }}
          >
            ◷ {s.timers[0].title} · <LiveTimer end={s.timers[0].end} />
          </button>
        )}
        {sheet && (
          <Sheet
            key={`${sheet.type}/${sheet.task?.id || sheet.item?.id || ""}`}
          />
        )}{" "}
        {!s.onboarded && (
          <Onboarding
            done={(demo) => {
              useStore.setState({ onboarded: true });
              if (demo) s.demoData();
            }}
          />
        )}
        {toast && (
          <div className="toast" role="status">
            ✓ {toast}
          </div>
        )}
      </div>
    </AppContext.Provider>
  );
}
function Task({ t, compact = false }) {
  const {
    s,
    page,
    setPage,
    tab,
    setTab,
    date,
    setDate,
    sheet,
    setSheet,
    toast,
    setToast,
    query,
    setQuery,
    now,
    settings,
    tasks,
    items,
    todayTasks,
    habits,
    tell,
    nav,
    edit,
    focus,
    next,
  } = useContext(AppContext);
  return (
    <div
      className={`task ${t.done ? "completed" : ""} ${t.frog ? "frog" : ""} ${compact ? "compact" : ""}`}
    >
      <button
        className={`check ${t.done ? "checked" : ""}`}
        aria-label={t.done ? "Вернуть задачу" : "Выполнить задачу"}
        onClick={() => s.complete(t.id)}
      >
        {t.done ? "✓" : ""}
      </button>
      <button className="task-body" onClick={() => edit(t)}>
        <span className="task-title">
          {!!t.frog && <span className="star">✦ </span>}
          {t.title}
        </span>
        <span className="task-meta">
          {t.area && <span className="area-dot">{t.area}</span>}
          {duration(t.duration_min)}
          {!!t.deep && " · глубокая работа"}
          {t.checklist?.length > 0 &&
            ` · ${t.checklist.filter((c) => c.done).length}/${t.checklist.length}`}
        </span>
      </button>
      <button
        className="task-more"
        onClick={() => edit(t)}
        aria-label="Изменить задачу"
      >
        →
      </button>
    </div>
  );
}
function Habit({ h }) {
  const {
    s,
    page,
    setPage,
    tab,
    setTab,
    date,
    setDate,
    sheet,
    setSheet,
    toast,
    setToast,
    query,
    setQuery,
    now,
    settings,
    tasks,
    items,
    todayTasks,
    habits,
    tell,
    nav,
    edit,
    focus,
    next,
  } = useContext(AppContext);
  const done = items.find((i) => i.id === `hl/${h.id}:${date}`)?.data.done;
  return (
    <button
      className={`habit ${done ? "done" : ""}`}
      onClick={() => s.habitToggle(h.id, date)}
    >
      <span className="habit-icon">{done ? "✓" : "◌"}</span>
      <span>
        {h.data.title}
        <small>
          {
            habitStats(
              h,
              items.filter((i) => i.kind === "habit_log"),
            ).streak
          }{" "}
          дней подряд
        </small>
      </span>
      <span className="habit-check">{done ? "✓" : "+"}</span>
    </button>
  );
}
function Quick() {
  const {
    s,
    page,
    setPage,
    tab,
    setTab,
    date,
    setDate,
    sheet,
    setSheet,
    toast,
    setToast,
    query,
    setQuery,
    now,
    settings,
    tasks,
    items,
    todayTasks,
    habits,
    tell,
    nav,
    edit,
    focus,
    next,
  } = useContext(AppContext);
  const [text, setText] = useState("");
  return (
    <form
      className="quick"
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        s.putTask(parseInput(text, date));
        setText("");
        tell("Задача добавлена");
      }}
    >
      <span>＋</span>
      <input
        aria-label="Быстрый ввод"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Что хочется сделать?"
      />
      <button className="key" aria-label="Добавить задачу">
        ↵
      </button>
    </form>
  );
}
function Today() {
  const {
    s,
    page,
    setPage,
    tab,
    setTab,
    date,
    setDate,
    sheet,
    setSheet,
    toast,
    setToast,
    query,
    setQuery,
    now,
    settings,
    tasks,
    items,
    todayTasks,
    habits,
    tell,
    nav,
    edit,
    focus,
    next,
  } = useContext(AppContext);
  const scheduled = todayTasks
    .filter((t) => t.time)
    .sort((a, b) => a.time.localeCompare(b.time));
  let previous = minutes(settings.start);
  const load = workload(todayTasks, settings);
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">МЕСТО ДЛЯ ВАЖНОГО</span>
          <h1>
            {date === dateKey()
              ? "Хороший день начинается здесь"
              : pretty(date)}
          </h1>
          <p>Не всё сразу. Только то, что действительно важно.</p>
        </div>
        <button className="soft" onClick={() => setSheet({ type: "plan" })}>
          ✧ Спланировать день
        </button>
      </div>
      <div className="week-strip">
        {Array.from({ length: 7 }, (_, i) => {
          const start = addDays(dateKey(), -((new Date().getDay() + 6) % 7));
          const d = addDays(start, i);
          return (
            <button
              key={d}
              className={date === d ? "selected" : ""}
              onClick={() => setDate(d)}
            >
              <small>{pretty(d, { weekday: "short" })}</small>
              <b>{Number(d.slice(-2))}</b>
              <span
                className={
                  tasks.some((t) => t.date === d && !t.done) ? "date-dot" : ""
                }
              />
            </button>
          );
        })}
        <button
          className="calendar-pick"
          onClick={() => setSheet({ type: "date" })}
        >
          ▦<small>Дата</small>
        </button>
      </div>
      <div className="today-grid">
        <div className="main-column">
          <section className="now-card">
            <div className="section-label">
              <span>
                <span className="pulse" /> СЕЙЧАС
              </span>
              <span>{next ? duration(next.duration_min) : "Выдохните"}</span>
            </div>
            <h2>{next?.title || "Время для себя"}</h2>
            <p>
              {next?.frog
                ? "Главное на сегодня. Один спокойный шаг вперёд."
                : next
                  ? "Можно начать с этой задачи."
                  : "План свободен. Добавьте идею или отдохните."}
            </p>
            <div className="button-row">
              {next && (
                <>
                  <button className="primary" onClick={() => focus(next)}>
                    ▷ Фокус · 25 мин
                  </button>
                  <button className="soft" onClick={() => s.complete(next.id)}>
                    ✓ Готово
                  </button>
                </>
              )}
              <span className="now-decoration">✳</span>
            </div>
          </section>
          <Quick />
          <p className="input-hint">
            Попробуйте: «созвон завтра в 16:00 1.5ч #работа»
          </p>
          <section>
            <div className="section-title">
              <h2>Без спешки</h2>
              <span>
                {todayTasks.filter((t) => !t.time).length} без времени
              </span>
            </div>
            {todayTasks
              .filter((t) => !t.time)
              .map((t) => (
                <Task key={t.id} t={t} />
              ))}
            {!todayTasks.some((t) => !t.time) && (
              <Empty text="Здесь будут задачи без точного времени" />
            )}
          </section>
          <section>
            <div className="section-title">
              <h2>Маленькие опоры</h2>
              <button
                className="text-button"
                onClick={() => setSheet({ type: "habit" })}
              >
                ＋ Привычка
              </button>
            </div>
            <div className="habits">
              {habits
                .filter((h) =>
                  h.data.days?.includes(new Date(date + "T12:00:00").getDay()),
                )
                .map((h) => (
                  <Habit key={h.id} h={h} />
                ))}
            </div>
            {!habits.length && (
              <Empty text="Маленькое действие, которое делает день лучше" />
            )}
          </section>
          {tasks.some((t) => t.date && t.date < date && !t.done) && (
            <section>
              <div className="section-title">
                <h2>Осталось с прошлых дней</h2>
                <button
                  className="text-button"
                  onClick={() => {
                    const old = tasks.filter(
                      (t) => t.date && t.date < date && !t.done,
                    );
                    const l = workload([...todayTasks, ...old], settings);
                    if (l.time > l.capacity) {
                      setSheet({ type: "overload", tasks: old });
                      return;
                    }
                    old.forEach((t) => s.putTask({ ...t, date }));
                    tell("Хвосты перенесены");
                  }}
                >
                  Все на сегодня
                </button>
              </div>
              {tasks
                .filter((t) => t.date && t.date < date && !t.done)
                .map((t) => (
                  <Task key={t.id} t={t} />
                ))}
              {tasks.some((t) => t.date < addDays(date, -7) && !t.done) && (
                <button
                  className="soft"
                  onClick={() => {
                    tasks
                      .filter(
                        (t) => t.date && t.date < addDays(date, -7) && !t.done,
                      )
                      .forEach((t) =>
                        s.putTask({ ...t, date: null, time: "" }),
                      );
                    tell("Старые задачи перенесены во входящие");
                  }}
                >
                  Старше 7 дней → во входящие
                </button>
              )}
            </section>
          )}
          <button
            className="day-close"
            onClick={() => setSheet({ type: "close" })}
          >
            <span>☾</span>
            <div>
              <b>Завершить день</b>
              <small>Заметить хорошее и отпустить остальное</small>
            </div>
            <span>→</span>
          </button>
        </div>
        <aside className="day-plan">
          <div className="section-title">
            <h2>Ритм дня</h2>
            <span>{pretty(date)}</span>
          </div>
          <div className="load-caption">
            <span>
              {duration(
                todayTasks
                  .filter((t) => !t.done)
                  .reduce((a, t) => a + t.duration_min, 0),
              )}{" "}
              в плане
            </span>
            <span>
              {Math.round((load.time / load.capacity) * 100)}% нагрузки
            </span>
          </div>
          <div className="meter">
            <i
              style={{
                width: `${Math.min(100, (load.time / load.capacity) * 100)}%`,
              }}
            />
          </div>
          <div className="timeline">
            {scheduled.map((t) => {
              const gap = minutes(t.time) - previous;
              previous = Math.max(previous, minutes(t.time) + t.duration_min);
              return (
                <React.Fragment key={t.id}>
                  {gap >= 20 && (
                    <div className="free-time">
                      <span>{timeString(minutes(t.time) - gap)}</span>
                      <div>{duration(gap)} · свободное окно</div>
                    </div>
                  )}
                  <div
                    className="time-block"
                    data-start={minutes(t.time)}
                    data-end={minutes(t.time) + t.duration_min}
                  >
                    <time>{t.time}</time>
                    <div
                      style={{
                        minHeight:
                          t.duration_min <= 20
                            ? "auto"
                            : Math.min(160, 52 + t.duration_min * 0.6),
                      }}
                    >
                      <Task t={t} compact={t.duration_min <= 20} />
                    </div>
                  </div>
                </React.Fragment>
              );
            })}
            {date === dateKey() && <TimelineNow now={now} tasks={todayTasks} />}
            {!scheduled.length && (
              <Empty text="Время не обязано быть расписано по минутам" />
            )}
            <div className="free-time">
              <span>{settings.end}</span>
              <div>Время отдыхать</div>
            </div>
          </div>
          <div className="quote">
            «Оставьте в дне немного воздуха.»
            <span>Меньше суеты, больше жизни</span>
          </div>
        </aside>
      </div>
    </>
  );
}
function Plans() {
  const {
    s,
    page,
    setPage,
    tab,
    setTab,
    date,
    setDate,
    sheet,
    setSheet,
    toast,
    setToast,
    query,
    setQuery,
    now,
    settings,
    tasks,
    items,
    todayTasks,
    habits,
    tell,
    nav,
    edit,
    focus,
    next,
  } = useContext(AppContext);
  const active = tab || "Входящие";
  const start = addDays(
    date,
    -((new Date(date + "T12:00:00").getDay() + 6) % 7),
  );
  const month = date.slice(0, 7);
  const count = new Date(
    Number(month.slice(0, 4)),
    Number(month.slice(5)),
    0,
  ).getDate();
  const monthTasks = tasks.filter((t) => t.date?.startsWith(month) && t.done);
  return (
    <>
      <PageHead
        title="Большое — маленькими шагами"
        text="Освободите голову. Для каждой идеи найдётся своё время."
      />
      <Tabs
        values={["Входящие", "Неделя", "Месяц"]}
        value={active}
        onChange={setTab}
      />
      {active === "Входящие" ? (
        <section className="panel">
          <div className="section-title">
            <h2>Пока без даты</h2>
            <button
              className="soft"
              onClick={() => setSheet({ type: "task", inbox: true })}
            >
              ＋ Задача
            </button>
          </div>
          {tasks
            .filter((t) => !t.date)
            .map((t) => (
              <Task key={t.id} t={t} />
            ))}
          {!tasks.some((t) => !t.date) && (
            <Empty text="Сюда можно складывать мысли, которым ещё не назначен день" />
          )}
        </section>
      ) : active === "Неделя" ? (
        <>
          <div className="section-title">
            <button className="soft" onClick={() => setDate(addDays(date, -7))}>
              ←
            </button>
            <h2>
              {pretty(start)} — {pretty(addDays(start, 6))}
            </h2>
            <button className="soft" onClick={() => setDate(addDays(date, 7))}>
              →
            </button>
          </div>
          <div className="week-grid">
            {Array.from({ length: 7 }, (_, i) => {
              const d = addDays(start, i),
                ts = tasks.filter((t) => t.date === d),
                load = workload(ts, settings);
              const light = items.find((x) => x.id === `light/${d}`)?.data
                .light;
              return (
                <section className="panel week-day" key={d}>
                  <h3>
                    {pretty(d, { weekday: "long" })}
                    <small>{pretty(d)}</small>
                  </h3>
                  <button
                    className={`pill ${light ? "active" : ""}`}
                    onClick={() =>
                      s.putItem(
                        "plan",
                        { date: d, light: !light },
                        `light/${d}`,
                      )
                    }
                  >
                    {light
                      ? "☁ Лёгкий день"
                      : load.time < load.capacity * 0.5
                        ? "☁ Есть воздух"
                        : "Обычный день"}
                  </button>
                  {ts.map((t) => (
                    <Task key={t.id} t={t} compact />
                  ))}
                  <button
                    className="text-button"
                    onClick={() => {
                      setDate(d);
                      setSheet({ type: "task" });
                    }}
                  >
                    ＋ Добавить
                  </button>
                </section>
              );
            })}
          </div>
          <section className="panel">
            <h2>Баланс по сферам</h2>
            {[...new Set(tasks.map((t) => t.area).filter(Boolean))].map((a) => (
              <div className="stat-line" key={a}>
                <span>{a}</span>
                <b>
                  {duration(
                    tasks
                      .filter(
                        (t) =>
                          t.area === a &&
                          t.date >= start &&
                          t.date <= addDays(start, 6),
                      )
                      .reduce((n, t) => n + t.duration_min, 0),
                  )}
                </b>
              </div>
            ))}
          </section>
        </>
      ) : (
        <>
          <div className="section-title">
            <button
              className="soft"
              onClick={() => {
                const d = new Date(date + "T12:00:00");
                d.setDate(1);
                d.setMonth(d.getMonth() - 1);
                setDate(dateKey(d));
              }}
            >
              ←
            </button>
            <h2>{pretty(date, { month: "long", year: "numeric" })}</h2>
            <button
              className="soft"
              onClick={() => {
                const d = new Date(date + "T12:00:00");
                d.setDate(1);
                d.setMonth(d.getMonth() + 1);
                setDate(dateKey(d));
              }}
            >
              →
            </button>
          </div>
          <div className="stats">
            <Stat
              value={monthTasks.reduce((n, t) => n + points(t), 0)}
              label="очков за месяц"
            />
            <Stat value={monthTasks.length} label="задач завершено" />
            <Stat value={dayStreak(tasks)} label="дней подряд" />
            <Stat
              value={new Set(monthTasks.map((t) => t.date)).size}
              label="активных дней"
            />
          </div>
          <section className="panel">
            <div className="month-grid">
              {["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"].map((d) => (
                <small key={d}>{d}</small>
              ))}
              {Array.from(
                { length: (new Date(month + "-01T12:00:00").getDay() + 6) % 7 },
                (_, i) => (
                  <span key={"blank" + i} />
                ),
              )}
              {Array.from({ length: count }, (_, i) => {
                const d = `${month}-${String(i + 1).padStart(2, "0")}`,
                  ts = tasks.filter((t) => t.date === d);
                return (
                  <button
                    key={d}
                    onClick={() => {
                      setDate(d);
                      nav("today");
                    }}
                    className={`month-day ${d === dateKey() ? "active" : ""}`}
                  >
                    <b>{i + 1}</b>
                    <span>
                      {ts
                        .filter((t) => t.done)
                        .reduce((n, t) => n + points(t), 0)}{" "}
                      очк.
                    </span>
                    <i
                      style={{
                        width: `${Math.min(100, ts.reduce((n, t) => n + t.duration_min, 0) / 3.9)}%`,
                      }}
                    />
                  </button>
                );
              })}
            </div>
          </section>
          <section className="panel">
            <h2>Рекорды по дням недели</h2>
            {dayNames.map((name, i) => {
              const days = [
                ...new Set(
                  monthTasks
                    .filter(
                      (t) => new Date(t.date + "T12:00:00").getDay() === i,
                    )
                    .map((t) => t.date),
                ),
              ];
              return (
                <div className="stat-line" key={name}>
                  <span>{name}</span>
                  <b>
                    {Math.max(
                      0,
                      ...days.map((d) =>
                        monthTasks
                          .filter((t) => t.date === d)
                          .reduce((n, t) => n + points(t), 0),
                      ),
                    )}{" "}
                    очков
                  </b>
                </div>
              );
            })}
          </section>
        </>
      )}
    </>
  );
}
function Growth() {
  const {
    s,
    page,
    setPage,
    tab,
    setTab,
    date,
    setDate,
    sheet,
    setSheet,
    toast,
    setToast,
    query,
    setQuery,
    now,
    settings,
    tasks,
    items,
    todayTasks,
    habits,
    tell,
    nav,
    edit,
    focus,
    next,
  } = useContext(AppContext);
  const active = tab || "Привычки";
  return (
    <>
      <PageHead
        title="Растите в своём темпе"
        text="Не идеальные серии, а маленькие возвращения к себе."
      />
      <Tabs
        values={["Привычки", "Сферы", "12 недель"]}
        value={active}
        onChange={setTab}
      />
      {active === "Привычки" ? (
        <>
          <button
            className="primary"
            onClick={() => setSheet({ type: "habit" })}
          >
            ＋ Новая привычка
          </button>
          <div className="cards">
            {habits.map((h) => {
              const stats = habitStats(
                h,
                items.filter((i) => i.kind === "habit_log"),
              );
              return (
                <section className="panel" key={h.id}>
                  <div className="section-title">
                    <h2>{h.data.title}</h2>
                    <button
                      className="text-button"
                      onClick={() => setSheet({ type: "habit", item: h })}
                    >
                      Изменить
                    </button>
                  </div>
                  <div className="stats">
                    <Stat value={stats.streak} label="дней подряд" />
                    <Stat value={`${stats.percent}%`} label="за этот месяц" />
                  </div>
                  <div className="habit-grid">
                    {Array.from({ length: 14 }, (_, i) => {
                      const d = addDays(dateKey(), i - 13),
                        done = items.find((x) => x.id === `hl/${h.id}:${d}`)
                          ?.data.done;
                      return (
                        <button
                          key={d}
                          title={pretty(d)}
                          className={done ? "active" : ""}
                          onClick={() => s.habitToggle(h.id, d)}
                        >
                          {done ? "✓" : Number(d.slice(-2))}
                        </button>
                      );
                    })}
                  </div>
                  <p className="muted">
                    {(h.data.days || [0, 1, 2, 3, 4, 5, 6])
                      .map((d) => dayNames[d])
                      .join(" · ")}
                    {h.data.reminder && ` · напоминание ${h.data.reminder}`}
                  </p>
                </section>
              );
            })}
          </div>
          {!habits.length && (
            <Empty text="Начните с привычки, на которую хватит двух минут" />
          )}
        </>
      ) : active === "Сферы" ? (
        <>
          <button
            className="primary"
            onClick={() => setSheet({ type: "area" })}
          >
            ＋ Добавить сферу
          </button>
          <div className="cards">
            {items
              .filter((i) => i.kind === "area")
              .map((a) => {
                const mins = tasks
                  .filter(
                    (t) =>
                      t.done &&
                      t.area === a.data.title &&
                      t.date >= addDays(dateKey(), -6) &&
                      t.date <= dateKey(),
                  )
                  .reduce((n, t) => n + t.duration_min, 0);
                return (
                  <section className="panel" key={a.id}>
                    <div className="section-title">
                      <h2>{a.data.title}</h2>
                      <button
                        className="text-button"
                        onClick={() => setSheet({ type: "area", item: a })}
                      >
                        Изменить
                      </button>
                    </div>
                    <h3>
                      {duration(mins)}{" "}
                      <small>из {a.data.hours} ч за 7 дней</small>
                    </h3>
                    <div className="meter">
                      <i
                        style={{
                          width: `${Math.min(100, (mins / (a.data.hours * 60)) * 100)}%`,
                        }}
                      />
                    </div>
                    <p>
                      {mins
                        ? "Вы уделяете этому внимание"
                        : "Пора уделить немного внимания"}
                    </p>
                  </section>
                );
              })}
          </div>
        </>
      ) : (
        <Cycle />
      )}
    </>
  );
}
function Cycle() {
  const {
    s,
    page,
    setPage,
    tab,
    setTab,
    date,
    setDate,
    sheet,
    setSheet,
    toast,
    setToast,
    query,
    setQuery,
    now,
    settings,
    tasks,
    items,
    todayTasks,
    habits,
    tell,
    nav,
    edit,
    focus,
    next,
  } = useContext(AppContext);
  const plan = items.find((i) => i.id === "cycle"),
    start = plan?.data.start || dateKey();
  const week = Math.min(
    12,
    Math.max(
      1,
      Math.floor((new Date(dateKey()) - new Date(start)) / 604800000) + 1,
    ),
  );
  const goals = items.filter((i) => i.kind === "goal");
  const tactics = items.filter((i) => i.kind === "tactic");
  const current = tactics.filter((i) => i.data.week === week);
  const completed = current.filter((t) =>
    items.some((l) => l.id === `tl/${t.id}/${week}` && l.data.done),
  ).length;
  const pct = current.length
    ? Math.round((completed / current.length) * 100)
    : 0;
  return (
    <>
      <section className="panel">
        <div className="section-title">
          <h2>Неделя {week} из 12</h2>
          <Field label="Начало цикла">
            <input
              type="text"
              placeholder="ГГГГ-ММ-ДД"
              defaultValue={start}
              onBlur={(e) => {
                if (/^\d{4}-\d{2}-\d{2}$/.test(e.target.value))
                  s.putItem("plan", { start: e.target.value }, "cycle");
              }}
            />
          </Field>
        </div>
        <h3>{pct}% недели</h3>
        <div className="meter target">
          <i style={{ width: `${pct}%` }} />
          <em />
        </div>
        <p className="muted">
          Ориентир — 85%. {completed} из {current.length} шагов выполнено.
        </p>
        <button className="primary" onClick={() => setSheet({ type: "goal" })}>
          ＋ Цель
        </button>
      </section>
      {goals.map((g) => (
        <section className="panel" key={g.id}>
          <div className="section-title">
            <h2>{g.data.title}</h2>
            <button
              className="text-button"
              onClick={() => setSheet({ type: "tactic", goal: g.id, week })}
            >
              ＋ Шаг
            </button>
          </div>
          {tactics
            .filter((t) => t.data.goal === g.id)
            .map((t) => (
              <button
                className="habit"
                key={t.id}
                onClick={() =>
                  s.putItem(
                    "tactic_log",
                    {
                      done: !items.find(
                        (l) => l.id === `tl/${t.id}/${t.data.week}`,
                      )?.data.done,
                    },
                    `tl/${t.id}/${t.data.week}`,
                  )
                }
              >
                <span>
                  {items.find((l) => l.id === `tl/${t.id}/${t.data.week}`)?.data
                    .done
                    ? "✓"
                    : "○"}
                </span>
                <span>
                  {t.data.title}
                  <small>Неделя {t.data.week}</small>
                </span>
              </button>
            ))}
        </section>
      ))}
    </>
  );
}
function More() {
  const {
    s,
    page,
    setPage,
    tab,
    setTab,
    date,
    setDate,
    sheet,
    setSheet,
    toast,
    setToast,
    query,
    setQuery,
    now,
    settings,
    tasks,
    items,
    todayTasks,
    habits,
    tell,
    nav,
    edit,
    focus,
    next,
  } = useContext(AppContext);
  const active = tab || "Таймеры";
  return (
    <>
      <PageHead
        title="Всё, что поддерживает"
        text="Немного порядка снаружи. Немного спокойствия внутри."
      />
      <Tabs
        values={["Таймеры", "Заметки", "Данные", "Настройки"]}
        value={active}
        onChange={setTab}
      />
      {active === "Таймеры" ? (
        <>
          <section className="panel timer-hero">
            <span className="eyebrow">ОДНО ДЕЛО ЗА РАЗ</span>
            <h2>Время сосредоточиться</h2>
            <div className="timer-clock">
              25<span>:00</span>
            </div>
            <div className="button-row">
              <button
                className="primary"
                onClick={() => s.addTimer("Фокус", 25)}
              >
                ▷ 25 минут
              </button>
              <button
                className="soft"
                onClick={() => s.addTimer("Глубокая работа", 50)}
              >
                50 минут
              </button>
              <button
                className="soft"
                onClick={() => setSheet({ type: "timer" })}
              >
                ＋ Свой
              </button>
            </div>
          </section>
          {s.timers.map((t) => (
            <section className="panel stat-line" key={t.id}>
              <span>{t.title}</span>
              <b>{<LiveTimer end={t.end} />}</b>
              <button
                className="text-button"
                onClick={() => s.removeTimer(t.id)}
              >
                Завершить
              </button>
            </section>
          ))}
          <p className="muted">
            Таймеры работают только на этом устройстве. В фоне браузер может
            задерживать обновления.
          </p>
        </>
      ) : active === "Заметки" ? (
        <>
          <div className="toolbar">
            <input
              placeholder="Найти заметку…"
              aria-label="Поиск заметок"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button
              className="primary"
              onClick={() => setSheet({ type: "note" })}
            >
              ＋ Заметка
            </button>
          </div>
          <div className="cards">
            {items
              .filter(
                (i) =>
                  i.kind === "note" &&
                  `${i.data.title} ${i.data.text}`
                    .toLowerCase()
                    .includes(query.toLowerCase()),
              )
              .map((n) => (
                <button
                  className="panel note"
                  key={n.id}
                  onClick={() => setSheet({ type: "note", item: n })}
                >
                  <span className="eyebrow">МЫСЛИ НА БУМАГЕ</span>
                  <h2>{n.data.title}</h2>
                  <p>{n.data.text}</p>
                </button>
              ))}
          </div>
        </>
      ) : active === "Данные" ? (
        <DataPanel />
      ) : (
        <Settings />
      )}
    </>
  );
}
function DataPanel() {
  const {
    s,
    page,
    setPage,
    tab,
    setTab,
    date,
    setDate,
    sheet,
    setSheet,
    toast,
    setToast,
    query,
    setQuery,
    now,
    settings,
    tasks,
    items,
    todayTasks,
    habits,
    tell,
    nav,
    edit,
    focus,
    next,
  } = useContext(AppContext);
  const [month, setMonth] = useState(date.slice(0, 7));
  const data = () => monthExport(tasks, items, month);
  const download = () => {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(data(), null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `planner-${month}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };
  const importFile = async (e) => {
    try {
      const input = JSON.parse(await e.target.files[0].text());
      if (!Array.isArray(input.tasks))
        throw Error("Ожидается объект с массивом tasks");
      let count = 0;
      const names = new Set(tasks.map((t) => t.title.toLowerCase()));
      for (const t of input.tasks) {
        if (typeof t.title !== "string" || names.has(t.title.toLowerCase()))
          continue;
        s.putTask({
          ...parseInput(t.title),
          ...t,
          id: uid(),
          rev: 0,
          deleted: false,
        });
        names.add(t.title.toLowerCase());
        count++;
      }
      const list = [
        ...(input.items || []),
        ...(input.habits || []).map((h) => ({
          kind: "habit",
          data:
            typeof h === "string"
              ? {
                  title: { days: [0, 1, 2, 3, 4, 5, 6], ...h },
                  days: [0, 1, 2, 3, 4, 5, 6],
                }
              : { days: [0, 1, 2, 3, 4, 5, 6], ...h },
        })),
      ];
      const seen = new Set(
        items.map((i) => `${i.kind}/${i.data.title || i.id}`),
      );
      for (const i of list) {
        if (
          ![
            "habit",
            "habit_log",
            "day",
            "note",
            "area",
            "plan",
            "goal",
            "tactic",
            "tactic_log",
            "settings",
          ].includes(i.kind) ||
          !i.data
        )
          continue;
        const k = `${i.kind}/${i.data.title || i.id}`;
        if (seen.has(k)) continue;
        s.putItem(i.kind, i.data, i.id || uid());
        seen.add(k);
        count++;
      }
      tell(`Импортировано: ${count}`);
    } catch (e) {
      tell(`Ошибка импорта: ${e.message}`);
    }
  };
  return (
    <section className="panel">
      <h2>Посмотреть на месяц со стороны</h2>
      <p>JSON для резервной копии и готовый запрос для разбора с Claude.</p>
      <Field label="Месяц (ГГГГ-ММ)">
        <input
          value={month}
          pattern="\d{4}-\d{2}"
          onChange={(e) => setMonth(e.target.value)}
        />
      </Field>
      <div className="button-row">
        <button className="primary" onClick={download}>
          ↓ Скачать JSON
        </button>
        <button
          className="soft"
          onClick={() =>
            navigator.clipboard
              .writeText(exportPrompt + JSON.stringify(data(), null, 2))
              .then(() => tell("Промпт и данные скопированы"))
              .catch(() => tell("Буфер недоступен — скачайте JSON"))
          }
        >
          Копировать для Claude
        </button>
      </div>
      <hr />
      <h2>Импорт данных</h2>
      <p>
        Принимается экспорт планера или {"{tasks: […], habits: […]}"}.
        Совпадения по названию пропускаются.
      </p>
      <input
        type="file"
        accept=".json,application/json"
        aria-label="Импорт JSON"
        onChange={importFile}
      />
    </section>
  );
}
function Settings() {
  const {
    s,
    page,
    setPage,
    tab,
    setTab,
    date,
    setDate,
    sheet,
    setSheet,
    toast,
    setToast,
    query,
    setQuery,
    now,
    settings,
    tasks,
    items,
    todayTasks,
    habits,
    tell,
    nav,
    edit,
    focus,
    next,
  } = useContext(AppContext);
  const [key, setKey] = useState(""),
    [token, setToken] = useState(""),
    [notionPage, setNotionPage] = useState(""),
    [service, setService] = useState("");
  const act = async (fn) => {
    try {
      await fn();
      tell("Настройки сохранены");
    } catch (e) {
      tell(e.message);
    }
  };
  return (
    <div className="settings-grid">
      <section className="panel">
        <h2>Как вам уютнее?</h2>
        <Tabs
          values={["auto", "light", "dark"]}
          names={["Авто", "Светлая", "Тёмная"]}
          value={settings.theme}
          onChange={(v) => s.setting("theme", v)}
        />
        <h2>Мои часы</h2>
        <div className="form-grid">
          <Field label="Начало дня">
            <Clock
              value={settings.start}
              onChange={(v) => s.setting("start", v)}
            />
          </Field>
          <Field label="Конец дня">
            <Clock value={settings.end} onChange={(v) => s.setting("end", v)} />
          </Field>
          <Field label="Пик энергии">
            <Clock
              value={settings.peak}
              onChange={(v) => s.setting("peak", v)}
            />
          </Field>
          <Field label="Глубокая работа, ч">
            <input
              type="number"
              min="1"
              max="12"
              value={settings.headLimit}
              onChange={(e) => s.setting("headLimit", Number(e.target.value))}
            />
          </Field>
        </div>
      </section>
      <section className="panel">
        <h2>Между устройствами</h2>
        <p>
          {s.key
            ? "Аккаунт подключён. Ключ даёт полный доступ к вашим данным."
            : "Откройте планер из Telegram, скопируйте ключ сюда. До подключения данные хранятся на устройстве."}
        </p>
        <p className="muted">
          При подключении локальный список заменяется данными аккаунта. Сначала
          экспортируйте важное.
        </p>
        {s.key ? (
          <>
            <button
              className="soft"
              onClick={() =>
                navigator.clipboard
                  .writeText(s.key)
                  .then(() => tell("Ключ скопирован"))
                  .catch(() => tell("Не удалось скопировать"))
              }
            >
              Копировать мой ключ
            </button>
            <button
              className="text-button"
              onClick={() => setSheet({ type: "disconnect" })}
            >
              Выйти
            </button>
          </>
        ) : (
          <>
            <Field label="Персональный ключ">
              <input
                type="password"
                autoComplete="off"
                value={key}
                onChange={(e) => setKey(e.target.value)}
              />
            </Field>
            <button
              className="primary"
              disabled={!key.trim()}
              onClick={async () => {
                try {
                  const r = await fetch("/api/tasks/sync?since=0", {
                    headers: { Authorization: `Bearer ${key.trim()}` },
                  });
                  if (!r.ok) throw Error("Ключ не подошёл");
                  s.connect(key);
                  tell("Аккаунт подключён");
                } catch (e) {
                  tell(e.message);
                }
              }}
            >
              Подключить
            </button>
          </>
        )}
        <p className="muted">{s.status}</p>
        <button className="text-button" onClick={sync}>
          Синхронизировать сейчас
        </button>
      </section>
      <section className="panel">
        <h2>Telegram-бот</h2>
        <p>
          Текст и голос превращаются в задачи. Первичную настройку выполняет
          владелец Worker.
        </p>
        <Field label="SERVICE_KEY владельца (не сохраняется)">
          <input
            type="password"
            value={service}
            onChange={(e) => setService(e.target.value)}
          />
        </Field>
        <button
          className="soft"
          disabled={!s.key || !service}
          onClick={() =>
            act(async () => {
              await api(
                "/api/telegram/setup",
                {},
                {
                  "X-Service-Key": service,
                  "X-Telegram-User-Id": s.user || "1",
                },
              );
              setService("");
            })
          }
        >
          Настроить бота
        </button>
      </section>
      <section className="panel">
        <h2>Notion</h2>
        <p>
          Односторонняя копия задач с датой. Поделитесь страницей с внутренней
          интеграцией.
        </p>
        <Field label="Секрет интеграции">
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
        </Field>
        <Field label="Ссылка на страницу">
          <input
            value={notionPage}
            onChange={(e) => setNotionPage(e.target.value)}
            placeholder="https://notion.so/…"
          />
        </Field>
        <button
          className="soft"
          disabled={!s.key || !token || !notionPage}
          onClick={() =>
            act(async () => {
              await api("/api/notion/setup", { token, page: notionPage });
              setToken("");
            })
          }
        >
          Создать базу «Планер»
        </button>
      </section>
    </div>
  );
}
function Sheet() {
  const {
    s,
    page,
    setPage,
    tab,
    setTab,
    date,
    setDate,
    sheet,
    setSheet,
    toast,
    setToast,
    query,
    setQuery,
    now,
    settings,
    tasks,
    items,
    todayTasks,
    habits,
    tell,
    nav,
    edit,
    focus,
    next,
  } = useContext(AppContext);
  const type = sheet.type;
  const [form, setForm] = useState(
    sheet.task ||
      sheet.item?.data || {
        title: "",
        date: sheet.inbox ? "" : date,
        time: "",
        duration_min: 30,
        priority: 2,
        slot: "anytime",
        area: "",
        note: "",
        checklist: [],
        days: [0, 1, 2, 3, 4, 5, 6],
        hours: 5,
        week: sheet.week || 1,
      },
  );
  const [step, setStep] = useState(0),
    [move, setMove] = useState([]),
    [preview, setPreview] = useState(null),
    [before, setBefore] = useState(null),
    [search, setSearch] = useState("");
  const change = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  const close = () => setSheet(null);
  const save = (e) => {
    e.preventDefault();
    if (type === "task") {
      s.putTask({
        ...parseInput(form.title, date),
        ...form,
        date: form.date || null,
      });
      tell("Задача сохранена");
    } else if (type === "timer") {
      s.addTimer(form.title || "Таймер", Number(form.duration_min));
      tell("Таймер запущен");
    } else {
      s.putItem(
        type,
        { ...form, goal: sheet.goal || form.goal },
        sheet.item?.id,
      );
      tell("Сохранено");
    }
    close();
  };
  const titles = {
    add: "Добавить немного ясности",
    task: sheet.task ? "Детали задачи" : "Новая задача",
    habit: "Маленькая привычка",
    note: "Заметка",
    timer: "Таймер",
    area: "Сфера жизни",
    goal: "Цель на 12 недель",
    tactic: "Еженедельный шаг",
    plan: "План без перегруза",
    close: "Спасибо этому дню",
    search: "Найти важное",
    date: "Выбрать день",
    overload: "Дню нужно больше воздуха",
    disconnect: "Выйти из аккаунта?",
  };
  return (
    <div className="overlay" onClick={close}>
      <section
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={titles[type]}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" />
        <div className="section-title">
          <h2>{titles[type]}</h2>
          <button className="icon-button" onClick={close} aria-label="Закрыть">
            ×
          </button>
        </div>
        {type === "add" ? (
          <div className="add-options">
            {[
              ["task", "✓", "Задача", "Освободить голову"],
              ["habit", "◌", "Привычка", "Поддержать себя"],
              ["note", "▤", "Заметка", "Сохранить мысль"],
              ["timer", "◷", "Таймер", "Побыть в фокусе"],
            ].map(([t, ic, title, desc]) => (
              <button key={t} onClick={() => setSheet({ type: t })}>
                <b>{ic}</b>
                <span>
                  {title}
                  <small>{desc}</small>
                </span>
                <span>→</span>
              </button>
            ))}
          </div>
        ) : type === "search" ? (
          <>
            <input
              autoFocus
              placeholder="Задачи, заметки, привычки…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {tasks
              .filter(
                (t) =>
                  search &&
                  t.title.toLowerCase().includes(search.toLowerCase()),
              )
              .map((t) => (
                <Task key={t.id} t={t} />
              ))}
            {items
              .filter(
                (i) =>
                  search &&
                  `${i.data.title || ""} ${i.data.text || ""}`
                    .toLowerCase()
                    .includes(search.toLowerCase()),
              )
              .map((i) => (
                <button
                  className="habit"
                  key={i.id}
                  onClick={() => setSheet({ type: i.kind, item: i })}
                >
                  {i.data.title}
                </button>
              ))}
          </>
        ) : type === "date" ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setDate(form.date);
              close();
            }}
          >
            <Field label="Дата (ГГГГ-ММ-ДД)">
              <input
                required
                pattern="\d{4}-\d{2}-\d{2}"
                value={form.date}
                onChange={(e) => change("date", e.target.value)}
              />
            </Field>
            <button className="primary">Открыть день</button>
          </form>
        ) : type === "disconnect" ? (
          <>
            <p>
              Локальная копия будет очищена. Перед выходом убедитесь, что
              синхронизация завершилась.
            </p>
            <button
              className="danger"
              onClick={() => {
                s.disconnect();
                close();
              }}
            >
              Выйти и очистить копию
            </button>
          </>
        ) : type === "overload" ? (
          <>
            <p>
              После переноса расчётная нагрузка превысит 65% рабочего дня. Можно
              оставить часть на потом.
            </p>
            <button
              className="primary"
              onClick={() => {
                sheet.tasks.forEach((t) => s.putTask({ ...t, date }));
                close();
              }}
            >
              Всё равно перенести
            </button>
          </>
        ) : type === "plan" ? (
          <>
            <p className="muted">
              Оставим запас на жизнь: время задач × 1,5 против 65% рабочего дня.
            </p>
            {(() => {
              const l = workload(todayTasks, settings);
              return (
                <div className="plan-meters">
                  <Load
                    label="Время"
                    value={l.time}
                    max={l.capacity}
                    caption={`${duration(Math.round(l.time))} / ${duration(Math.round(l.capacity))}`}
                  />
                  <Load
                    label="Голова"
                    value={l.head}
                    max={l.headCapacity}
                    caption={`${l.head.toFixed(1)} / ${l.headCapacity} ч`}
                  />
                </div>
              );
            })()}
            <h3>Что перенести на завтра?</h3>
            {todayTasks
              .filter((t) => !t.done)
              .map((t) => (
                <label className="checkbox-line" key={t.id}>
                  <input
                    type="checkbox"
                    checked={move.includes(t.id)}
                    onChange={(e) =>
                      setMove(
                        e.target.checked
                          ? [...move, t.id]
                          : move.filter((id) => id !== t.id),
                      )
                    }
                  />
                  {t.title}
                </label>
              ))}
            <button
              className="soft"
              disabled={!move.length}
              onClick={() => {
                move.forEach((id) =>
                  s.putTask({
                    ...tasks.find((t) => t.id === id),
                    date: addDays(date, 1),
                  }),
                );
                close();
                tell("Выбранное перенесено на завтра");
              }}
            >
              Перенести выбранное ({move.length})
            </button>
            <hr />
            <h3>Автоплан</h3>
            <p>
              Главное — в пик энергии, мелочи — после. Обед 13:00–14:00
              свободен, между блоками 10 минут.
            </p>
            <button
              className="primary"
              onClick={() => setPreview(autoPlan(todayTasks, settings))}
            >
              Предпросмотр
            </button>
            {preview && (
              <>
                <div className="preview">
                  {preview.map((t) => (
                    <div className="stat-line" key={t.id}>
                      <b>{t.time}</b>
                      <span>{t.title}</span>
                    </div>
                  ))}
                  {!preview.length && (
                    <p>Нет свободных задач или подходящих окон.</p>
                  )}
                </div>
                <button
                  className="primary"
                  disabled={!preview.length}
                  onClick={() => {
                    setBefore(
                      preview.map((t) => tasks.find((x) => x.id === t.id)),
                    );
                    preview.forEach((t) => s.putTask(t));
                    setPreview(null);
                    tell("План применён");
                  }}
                >
                  Применить
                </button>
              </>
            )}
            {before && (
              <button
                className="soft"
                onClick={() => {
                  before.forEach((t) => s.putTask(t));
                  setBefore(null);
                  tell("Автоплан отменён");
                }}
              >
                ↶ Отменить автоплан
              </button>
            )}
          </>
        ) : type === "close" ? (
          <>
            <div className="steps">
              {[0, 1, 2].map((i) => (
                <span key={i} className={i <= step ? "active" : ""} />
              ))}
            </div>
            <p className="eyebrow">ШАГ {step + 1} ИЗ 3</p>
            {step === 0 ? (
              <>
                <h3>Что сделать с несделанным?</h3>
                {todayTasks
                  .filter((t) => !t.done)
                  .map((t) => (
                    <div className="review-task" key={t.id}>
                      <p>{t.title}</p>
                      <div className="button-row">
                        <button
                          className="soft"
                          onClick={() => s.complete(t.id)}
                        >
                          ✓ Готово
                        </button>
                        <button
                          className="soft"
                          onClick={() =>
                            s.putTask({ ...t, date: addDays(date, 1) })
                          }
                        >
                          Завтра
                        </button>
                        <button
                          className="soft"
                          onClick={() =>
                            s.putTask({ ...t, date: null, time: "" })
                          }
                        >
                          Входящие
                        </button>
                        <button
                          className="text-button"
                          onClick={() => s.putTask({ ...t, deleted: true })}
                        >
                          Удалить
                        </button>
                      </div>
                    </div>
                  ))}
              </>
            ) : step === 1 ? (
              <>
                {["mood", "energy"].map((k) => (
                  <div key={k}>
                    <h3>
                      {k === "mood"
                        ? "Как настроение?"
                        : "Сколько осталось энергии?"}
                    </h3>
                    <div className="rating">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <button
                          key={n}
                          className={(form[k] || 3) === n ? "active" : ""}
                          onClick={() => change(k, n)}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </>
            ) : (
              <>
                <Field label="Что хорошего было сегодня?">
                  <textarea
                    value={form.good || ""}
                    onChange={(e) => change("good", e.target.value)}
                    placeholder="Даже совсем маленькое…"
                  />
                </Field>
                <Field label="Что хочется оставить на бумаге?">
                  <textarea
                    value={form.text || ""}
                    onChange={(e) => change("text", e.target.value)}
                  />
                </Field>
              </>
            )}
            <div className="button-row">
              {step > 0 && (
                <button className="soft" onClick={() => setStep(step - 1)}>
                  Назад
                </button>
              )}
              <button
                className="primary"
                onClick={() => {
                  if (step < 2) setStep(step + 1);
                  else {
                    s.putItem(
                      "day",
                      {
                        date,
                        mood: form.mood || 3,
                        energy: form.energy || 3,
                        good: form.good || "",
                        text: form.text || "",
                      },
                      `day/${date}`,
                    );
                    close();
                    tell("День завершён. Вы сделали достаточно.");
                  }
                }}
              >
                {step === 2 ? "Завершить день" : "Дальше →"}
              </button>
            </div>
          </>
        ) : (
          <form onSubmit={save}>
            <Field label="Название">
              <input
                autoFocus
                required
                value={form.title}
                onChange={(e) => change("title", e.target.value)}
                placeholder={
                  type === "task" ? "Что хочется сделать?" : "Название"
                }
              />
            </Field>
            {type === "task" && (
              <>
                <div className="form-grid">
                  <Field label="Дата · ГГГГ-ММ-ДД">
                    <input
                      pattern="\d{4}-\d{2}-\d{2}"
                      placeholder="Без даты"
                      value={form.date || ""}
                      onChange={(e) => change("date", e.target.value)}
                    />
                  </Field>
                  <Field label="Время · ЧЧ:ММ">
                    <Clock
                      value={form.time || ""}
                      optional
                      onChange={(v) => change("time", v)}
                    />
                  </Field>
                  <Field label="Длительность, мин">
                    <input
                      type="number"
                      min="5"
                      max="1440"
                      step="5"
                      value={form.duration_min}
                      onChange={(e) =>
                        change("duration_min", Number(e.target.value))
                      }
                    />
                  </Field>
                  <Field label="Сфера">
                    <input
                      list="areas"
                      value={form.area || ""}
                      onChange={(e) => change("area", e.target.value)}
                    />
                    <datalist id="areas">
                      {items
                        .filter((i) => i.kind === "area")
                        .map((i) => (
                          <option key={i.id}>{i.data.title}</option>
                        ))}
                    </datalist>
                  </Field>
                  <Field label="Приоритет">
                    <select
                      value={form.priority}
                      onChange={(e) =>
                        change("priority", Number(e.target.value))
                      }
                    >
                      <option value="1">Важно</option>
                      <option value="2">Обычно</option>
                      <option value="3">Не срочно</option>
                    </select>
                  </Field>
                  <Field label="Часть дня">
                    <select
                      value={form.slot || "anytime"}
                      onChange={(e) => change("slot", e.target.value)}
                    >
                      <option value="anytime">Любое время</option>
                      <option value="morning">Утро</option>
                      <option value="afternoon">День</option>
                      <option value="evening">Вечер</option>
                    </select>
                  </Field>
                </div>
                <div className="button-row">
                  <label className="checkbox-line">
                    <input
                      type="checkbox"
                      checked={!!form.frog}
                      onChange={(e) => change("frog", e.target.checked)}
                    />
                    ✦ Главное на день
                  </label>
                  <label className="checkbox-line">
                    <input
                      type="checkbox"
                      checked={!!form.deep}
                      onChange={(e) => change("deep", e.target.checked)}
                    />
                    Глубокая работа
                  </label>
                </div>
                <Field label="Повтор">
                  <select
                    value={form.repeat?.type || ""}
                    onChange={(e) =>
                      change(
                        "repeat",
                        e.target.value
                          ? { type: e.target.value, days: [1, 3, 5] }
                          : null,
                      )
                    }
                  >
                    <option value="">Не повторять</option>
                    <option value="daily">Каждый день</option>
                    <option value="weekdays">По будням</option>
                    <option value="days">По дням недели</option>
                    <option value="month">Каждый месяц</option>
                  </select>
                </Field>
                {form.repeat?.type === "days" && (
                  <DayPicker
                    days={form.repeat.days}
                    onChange={(days) =>
                      change("repeat", { ...form.repeat, days })
                    }
                  />
                )}
                <Field label="Подзадачи">
                  {(form.checklist || []).map((c, i) => (
                    <div className="checklist-edit" key={i}>
                      <input
                        type="checkbox"
                        checked={!!c.done}
                        onChange={(e) =>
                          change(
                            "checklist",
                            form.checklist.map((v, j) =>
                              j === i ? { ...v, done: e.target.checked } : v,
                            ),
                          )
                        }
                      />
                      <input
                        value={c.title}
                        onChange={(e) =>
                          change(
                            "checklist",
                            form.checklist.map((v, j) =>
                              j === i ? { ...v, title: e.target.value } : v,
                            ),
                          )
                        }
                      />
                      <button
                        type="button"
                        className="text-button"
                        onClick={() =>
                          change(
                            "checklist",
                            form.checklist.filter((_, j) => j !== i),
                          )
                        }
                      >
                        ×
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="text-button"
                    onClick={() =>
                      change("checklist", [
                        ...(form.checklist || []),
                        { title: "", done: false },
                      ])
                    }
                  >
                    ＋ Добавить шаг
                  </button>
                </Field>
                <Field label="Заметка">
                  <textarea
                    value={form.note || ""}
                    onChange={(e) => change("note", e.target.value)}
                  />
                </Field>
              </>
            )}
            {type === "habit" && (
              <>
                <Field label="Дни недели">
                  <DayPicker
                    days={form.days}
                    onChange={(days) => change("days", days)}
                  />
                </Field>
                <Field label="Напомнить в Telegram · Москва">
                  <Clock
                    optional
                    value={form.reminder || ""}
                    onChange={(v) => change("reminder", v)}
                  />
                </Field>
              </>
            )}
            {type === "note" && (
              <Field label="Мысли">
                <textarea
                  rows="8"
                  value={form.text || ""}
                  onChange={(e) => change("text", e.target.value)}
                />
              </Field>
            )}
            {type === "timer" && (
              <Field label="Минуты">
                <input
                  type="number"
                  min="1"
                  max="1440"
                  value={form.duration_min}
                  onChange={(e) =>
                    change("duration_min", Number(e.target.value))
                  }
                />
              </Field>
            )}
            {type === "area" && (
              <Field label="Недельная цель, часы">
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={form.hours}
                  onChange={(e) => change("hours", Number(e.target.value))}
                />
              </Field>
            )}
            {type === "tactic" && (
              <Field label="Неделя цикла">
                <input
                  type="number"
                  min="1"
                  max="12"
                  value={form.week}
                  onChange={(e) => change("week", Number(e.target.value))}
                />
              </Field>
            )}
            <div className="button-row">
              <button className="primary" type="submit">
                {type === "timer" ? "Запустить" : "Сохранить"}
              </button>
              {sheet.task && (
                <button
                  className="soft"
                  type="button"
                  onClick={() => {
                    focus(sheet.task);
                    close();
                  }}
                >
                  ▷ Фокус
                </button>
              )}
              {(sheet.task || sheet.item) && (
                <button
                  className="text-button danger-text"
                  type="button"
                  onClick={() => {
                    if (sheet.task) s.putTask({ ...sheet.task, deleted: true });
                    else s.deleteItem(sheet.item.id);
                    close();
                    tell("Удалено");
                  }}
                >
                  Удалить
                </button>
              )}
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function TimelineNow({ now, tasks }) {
  const [top, setTop] = useState(null);
  useEffect(() => {
    const update = () => {
      const timeline = document.querySelector(".timeline");
      if (!timeline) return;
      const current =
        new Date(now).getHours() * 60 + new Date(now).getMinutes();
      const blocks = [...timeline.querySelectorAll(".time-block")];
      if (!blocks.length) {
        setTop(null);
        return;
      }
      const origin = timeline.getBoundingClientRect().top;
      const points = [];
      for (const b of blocks) {
        const rect = b.getBoundingClientRect();
        points.push(
          [Number(b.dataset.start), rect.top - origin],
          [Number(b.dataset.end), rect.bottom - origin],
        );
      }
      let pos = points[0][1] - 8;
      for (let i = 0; i < points.length - 1; i++) {
        const [a, y] = points[i],
          [b, z] = points[i + 1];
        if (current >= a && current <= b) {
          pos = y + ((z - y) * (current - a)) / (b - a || 1);
          break;
        }
        if (current > b) pos = z + 10;
      }
      setTop(pos);
    };
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [now, tasks]);
  return top === null ? null : (
    <div className="now-line" style={{ top }}>
      <time>
        {new Date(now).toLocaleTimeString("ru-RU", {
          hour: "2-digit",
          minute: "2-digit",
          hour12: false,
        })}
      </time>
      <span>сейчас</span>
    </div>
  );
}
function timerText(ms) {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  return seconds
    ? `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`
    : "Время вышло";
}
function LiveTimer({ end }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const i = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(i);
  }, []);
  return timerText(end - now);
}
function Onboarding({ done }) {
  const [step, setStep] = useState(0);
  const content = [
    [
      "✳",
      "Меньше суеты. Больше жизни.",
      "Тихо — место для задач, привычек и мыслей. Здесь не нужно успевать всё.",
    ],
    [
      "◷",
      "Планируйте с воздухом",
      "Выберите главное, оставьте время на отдых. Быстрый ввод понимает обычные слова.",
    ],
    [
      "◌",
      "Маленькие шаги считаются",
      "Привычки, сферы жизни и цели на 12 недель помогут видеть свой путь.",
    ],
    [
      "→",
      "Ваш день — везде с вами",
      "Работайте офлайн. Подключите Telegram в настройках, чтобы синхронизировать устройства и добавлять задачи голосом.",
    ],
  ];
  return (
    <div className="overlay onboarding">
      <section className="sheet">
        <span className="onboard-symbol">{content[step][0]}</span>
        <span className="eyebrow">ЗНАКОМСТВО · {step + 1} / 4</span>
        <h1>{content[step][1]}</h1>
        <p>{content[step][2]}</p>
        <div className="steps">
          {content.map((_, i) => (
            <span key={i} className={i === step ? "active" : ""} />
          ))}
        </div>
        {step < 3 ? (
          <button className="primary" onClick={() => setStep(step + 1)}>
            Продолжить →
          </button>
        ) : (
          <div className="button-row">
            <button className="primary" onClick={() => done(false)}>
              Начать с чистого листа
            </button>
            <button className="soft" onClick={() => done(true)}>
              Посмотреть пример
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
function PageHead({ title, text }) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">ПЛАНЕР В ВАШЕМ РИТМЕ</span>
        <h1>{title}</h1>
        <p>{text}</p>
      </div>
    </div>
  );
}
function Empty({ text }) {
  return (
    <div className="empty">
      <span>◌</span>
      <p>{text}</p>
    </div>
  );
}
function Tabs({ values, names, value, onChange }) {
  return (
    <div className="tabs">
      {values.map((v, i) => (
        <button
          key={v}
          className={v === value ? "active" : ""}
          onClick={() => onChange(v)}
        >
          {names?.[i] || v}
        </button>
      ))}
    </div>
  );
}
function Stat({ value, label }) {
  return (
    <div className="stat">
      <b>{value}</b>
      <small>{label}</small>
    </div>
  );
}
function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Clock({ value, onChange, optional }) {
  const formatInput = (event) => {
    const raw = event.target.value;
    // Accept both four keypad digits and pasted times such as 9:30.
    if (/^\d:[0-5]\d$/.test(raw)) {
      onChange(`0${raw}`);
      return;
    }
    const digits = raw.replace(/\D/g, "").slice(0, 4);
    onChange(digits.length > 2 ? `${digits.slice(0, 2)}:${digits.slice(2)}` : digits);
  };
  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder={optional ? "Без времени" : "09:00"}
      title="Введите 4 цифры: например, 1830 → 18:30"
      pattern="([01][0-9]|2[0-3]):[0-5][0-9]"
      required={!optional}
      maxLength="5"
      value={value}
      onChange={formatInput}
    />
  );
}

function DayPicker({ days = [0, 1, 2, 3, 4, 5, 6], onChange }) {
  return (
    <div className="day-picker">
      {[1, 2, 3, 4, 5, 6, 0].map((d) => (
        <button
          key={d}
          type="button"
          className={days.includes(d) ? "active" : ""}
          onClick={() =>
            onChange(
              days.includes(d) ? days.filter((x) => x !== d) : [...days, d],
            )
          }
        >
          {dayNames[d]}
        </button>
      ))}
    </div>
  );
}
function Load({ label, value, max, caption }) {
  return (
    <div>
      <div className="stat-line">
        <b>{label}</b>
        <span>{caption}</span>
      </div>
      <div className={`meter ${value > max ? "over" : ""}`}>
        <i style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
      </div>
      {value > max && <small>Стоит оставить часть дел на другой день</small>}
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
