import sql from "mssql";
import { loadEnvironment, databaseConfig } from "./config.js";
import { createDatabase } from "./database.js";

const pool = createDatabase(databaseConfig(loadEnvironment()));
await pool.connect();

const result = await pool.request().query(
  "SELECT id, code, name, is_legacy FROM dbo.workspaces ORDER BY name"
);

console.table(result.recordset);
await pool.close();
