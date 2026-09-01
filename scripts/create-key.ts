import { generateIngestToken } from "../src/auth.js";
import {
  operatorDatabase,
  requiredArgument,
  requiredKeyMode,
} from "./support.js";

const appID = requiredArgument("app-id");
const mode = requiredKeyMode();
const name = requiredArgument("name");
const expiresAt = process.argv.includes("--expires-at")
  ? requiredArgument("expires-at")
  : null;
const generated = generateIngestToken(mode);

const sql = operatorDatabase();
try {
  await sql`
    insert into ledge_private.ledge_ingest_keys (
      app_id,
      name,
      key_prefix,
      secret_digest,
      expires_at
    ) values (
      ${appID}::uuid,
      ${name},
      ${generated.keyPrefix},
      decode(${generated.secretDigestHex}, 'hex'),
      ${expiresAt}::timestamptz
    )
  `;

  // The complete token is intentionally emitted once and is never persisted.
  console.log(generated.token);
} finally {
  await sql.end();
}
