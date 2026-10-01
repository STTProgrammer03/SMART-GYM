import { writeFile } from 'node:fs/promises';
import { databaseConfig, loadEnvironment } from './config.js';
import { createDatabase, connectionError } from './database.js';

let pool;
try {
  // Validate before opening a network connection. Never print credentials.
  let config;
  try {
    config = databaseConfig(loadEnvironment());
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
  if (config) {
    pool = createDatabase(config);
    await pool.connect();
    const result = await pool.request().query(`
      SELECT s.name AS schema_name, t.name AS table_name,
             c.column_id, c.name AS column_name, ty.name AS data_type,
             c.max_length, c.precision, c.scale, c.is_nullable, c.is_identity,
             dc.definition AS default_definition,
             CASE WHEN EXISTS (
               SELECT 1 FROM sys.indexes i
               JOIN sys.index_columns ic
                 ON ic.object_id = i.object_id AND ic.index_id = i.index_id
               WHERE i.object_id = t.object_id AND i.is_primary_key = 1
                 AND ic.column_id = c.column_id
             ) THEN 1 ELSE 0 END AS is_primary_key
      FROM sys.tables t
      JOIN sys.schemas s ON s.schema_id = t.schema_id
      JOIN sys.columns c ON c.object_id = t.object_id
      JOIN sys.types ty ON ty.user_type_id = c.user_type_id
      LEFT JOIN sys.default_constraints dc ON dc.object_id = c.default_object_id
      WHERE t.name LIKE 'member%' OR t.name IN ('isapi_staff', 'access_events')
      ORDER BY s.name, t.name, c.column_id;
    `);
    await writeFile(new URL('schema.json', import.meta.url),
      JSON.stringify({ columns: result.recordset }, null, 2) + '\n');
    console.log('Connected to SQL Server. Saved table metadata to backend/schema.json.');
    console.log('No member records were read or changed.');
    if (!result.recordset.length) {
      console.log('No matching tables are visible. Check the database and metadata permissions.');
    }
  }
} catch (error) {
  console.error(connectionError(error));
  process.exitCode = 1;
} finally {
  await pool?.close();
}
