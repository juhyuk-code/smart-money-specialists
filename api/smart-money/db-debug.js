import pg from "pg";
import { sendJson } from "../../src/http.js";

export default async function handler(request, response) {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return sendJson(response, { hasDatabaseUrl: false, ok: false }, 200, { "cache-control": "no-store" });
  }

  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    const result = await client.query("select 1 as ok, current_database() as database_name");
    return sendJson(
      response,
      {
        hasDatabaseUrl: true,
        ok: result.rows[0]?.ok === 1,
        databaseName: result.rows[0]?.database_name ?? null,
      },
      200,
      { "cache-control": "no-store" },
    );
  } catch (error) {
    return sendJson(
      response,
      {
        hasDatabaseUrl: true,
        ok: false,
        errorCode: error?.code ?? null,
        errorMessage: safeMessage(error),
      },
      200,
      { "cache-control": "no-store" },
    );
  } finally {
    await client.end().catch(() => {});
  }
}

function safeMessage(error) {
  const message = error?.message ?? "Database connection failed";
  return message.replaceAll(process.env.DATABASE_URL ?? "", "[redacted]");
}
