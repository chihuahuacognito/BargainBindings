declare module "better-sqlite3" {
  interface RunResult {
    changes: number;
    lastInsertRowid: number | bigint;
  }

  interface Statement {
    run(...params: unknown[]): RunResult;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }

  interface Database {
    pragma(source: string): unknown;
    exec(source: string): this;
    prepare(source: string): Statement;
    transaction<T extends (...args: unknown[]) => unknown>(fn: T): T;
  }

  interface DatabaseConstructor {
    new (filename?: string): Database;
  }

  const Database: DatabaseConstructor;
  export default Database;
}
