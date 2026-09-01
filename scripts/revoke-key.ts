import { operatorDatabase, requiredArgument } from "./support.js";

const keyPrefix = requiredArgument("key-prefix");
const sql = operatorDatabase();
try {
  const result = await sql`
    update ledge_private.ledge_ingest_keys
       set revoked_at = now()
     where key_prefix = ${keyPrefix}
       and revoked_at is null
  `;
  if (result.count !== 1) throw new Error("active_key_not_found");
} finally {
  await sql.end();
}
