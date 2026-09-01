import { generateIngestToken } from "../src/auth.js";
import {
  operatorDatabase,
  requiredArgument,
  requiredEnvironment,
} from "./support.js";

const appID = requiredArgument("app-id");
const environment = requiredEnvironment();
const name = requiredArgument("name");
const expiresAt = process.argv.includes("--expires-at")
  ? requiredArgument("expires-at")
  : null;
const generated = generateIngestToken();

const sql = operatorDatabase();
try {
  await sql`
    insert into ledge_private.ledge_ingest_keys (
      app_id,
      environment,
      name,
      key_prefix,
      secret_digest,
      expires_at
    ) values (
      ${appID}::uuid,
      ${environment},
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
