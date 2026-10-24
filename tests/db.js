import { DatabaseSync } from "node:sqlite";
export function database() {
  const sql = new DatabaseSync(":memory:");
  const wrap = (q, args = []) => ({
    bind: (...a) => wrap(q, a),
    async all() {
      return { results: sql.prepare(q).all(...args) };
    },
    async first() {
      return sql.prepare(q).get(...args) || null;
    },
    async run() {
      const r = sql.prepare(q).run(...args);
      return { meta: { changes: Number(r.changes) } };
    },
  });
  return {
    prepare: (q) => wrap(q),
    async exec(q) {
      sql.exec(q);
    },
    async batch(stmts) {
      sql.exec("BEGIN");
      try {
        const result = [];
        for (const s of stmts) result.push(await s.run());
        sql.exec("COMMIT");
        return result;
      } catch (e) {
        sql.exec("ROLLBACK");
        throw e;
      }
    },
    close: () => sql.close(),
  };
}
