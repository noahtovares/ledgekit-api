import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import postgres from "postgres";

import { digestSecret } from "../src/auth.js";
import { handleTraceRequest } from "../src/ingest.js";
import { ingestThroughSupabase, SupabaseRpcError } from "../src/supabase.js";
import type { JsonObject, RpcResult } from "../src/types.js";

const databaseURL = process.env.DATABASE_URL;
const supabaseURL = process.env.SUPABASE_URL;
const supabaseSecretKey = process.env.SUPABASE_SECRET_KEY;
if (!databaseURL || !supabaseURL || !supabaseSecretKey) {
  throw new Error("DATABASE_URL_SUPABASE_URL_and_SUPABASE_SECRET_KEY_are_required");
}

const fixture = JSON.parse(
  await readFile(
    new URL("../test/fixtures/ledge-trace-v1.json", import.meta.url),
    "utf8",
  ),
) as JsonObject;
const secret = "A".repeat(43);
const digest = digestSecret(secret);
const productionSecret = "B".repeat(43);
const productionDigest = digestSecret(productionSecret);
const fixtureTraceID = (fixture.trace as JsonObject).id as string;
const sql = postgres(databaseURL, { max: 1, prepare: false });

async function expectDatabaseCode(
  code: string,
  operation: () => Promise<unknown>,
): Promise<void> {
  try {
    await operation();
    assert.fail(`expected database code ${code}`);
  } catch (error) {
    assert.equal((error as { code?: string }).code, code);
  }
}

async function ingest(
  keyPrefix: string,
  secretDigest: string,
  payload: JsonObject,
): Promise<RpcResult> {
  const [row] = await sql<{ result: RpcResult }[]>`
    select public.ingest_trace(
      ${keyPrefix},
      ${secretDigest},
      ${sql.json(payload as never)}::jsonb
    ) as result
  `;
  assert(row);
  return row.result;
}

try {
  await sql`
    truncate table
      ledge_private.ledge_traces,
      ledge_private.ledge_ingest_keys,
      ledge_private.ledge_apps
    cascade
  `;

  const [app] = await sql<{ id: string }[]>`
    insert into ledge_private.ledge_apps (service_name)
    values ('sample-app')
    returning id
  `;
  assert(app);
  const [testKey] = await sql<{ id: string }[]>`
    insert into ledge_private.ledge_ingest_keys (
      app_id,
      name,
      key_prefix,
      secret_digest
    ) values (
      ${app.id}::uuid,
      'test-integration',
      'lk_test_abcdefghijkl',
      decode(${digest}, 'hex')
    )
    returning id
  `;
  assert(testKey);

  const inserted = await ingest("lk_test_abcdefghijkl", digest, fixture);
  assert.equal(inserted.outcome, "inserted");
  assert.equal(inserted.appId, app.id);

  const duplicate = await ingest("lk_test_abcdefghijkl", digest, fixture);
  assert.equal(duplicate.outcome, "duplicate");
  const [countRow] = await sql<{ count: number }[]>`
    select count(*)::integer as count from ledge_private.ledge_traces
  `;
  assert(countRow);
  assert.equal(countRow.count, 1);

  const stored = await sql<{ ingestKeyId: string; envelope: JsonObject }[]>`
    select ingest_key_id as "ingestKeyId", envelope
      from ledge_private.ledge_traces
  `;
  assert.equal(stored[0]?.ingestKeyId, testKey.id);
  assert.deepEqual(stored[0]?.envelope, fixture);

  const [liveKey] = await sql<{ id: string }[]>`
    insert into ledge_private.ledge_ingest_keys (
      app_id,
      name,
      key_prefix,
      secret_digest
    ) values (
      ${app.id}::uuid,
      'live-integration',
      'lk_live_mnopqrstuvwx',
      decode(${productionDigest}, 'hex')
    )
    returning id
  `;
  assert(liveKey);
  const liveDuplicate = await ingest(
    "lk_live_mnopqrstuvwx",
    productionDigest,
    fixture,
  );
  assert.equal(liveDuplicate.outcome, "duplicate");
  assert.equal(liveDuplicate.appId, app.id);

  const [attributionAfterRetry] = await sql<{ ingestKeyId: string }[]>`
    select ingest_key_id as "ingestKeyId"
      from ledge_private.ledge_traces
     where app_id = ${app.id}::uuid
       and id = ${fixtureTraceID}::uuid
  `;
  assert.equal(attributionAfterRetry?.ingestKeyId, testKey.id);

  const [sharedIdentityCount] = await sql<{ count: number }[]>`
    select count(*)::integer as count
      from ledge_private.ledge_traces
     where app_id = ${app.id}::uuid
       and id = ${fixtureTraceID}::uuid
  `;
  assert.equal(sharedIdentityCount?.count, 1);

  const [otherApp] = await sql<{ id: string }[]>`
    insert into ledge_private.ledge_apps (service_name)
    values ('other-app')
    returning id
  `;
  assert(otherApp);
  const [otherAppKey] = await sql<{ id: string }[]>`
    insert into ledge_private.ledge_ingest_keys (
      app_id,
      name,
      key_prefix,
      secret_digest
    ) values (
      ${otherApp.id}::uuid,
      'other-test',
      'lk_test_zyxwvutsrqpo',
      decode(${digest}, 'hex')
    )
    returning id
  `;
  assert(otherAppKey);
  await assert.rejects(
    sql.begin(async (transaction) => {
      await transaction`
        update ledge_private.ledge_traces
           set ingest_key_id = ${otherAppKey.id}::uuid
         where app_id = ${app.id}::uuid
           and id = ${fixtureTraceID}::uuid
      `;
    }),
    (error: unknown) => (error as { code?: string }).code === "23503",
  );

  const conflict = structuredClone(fixture);
  (conflict.trace as JsonObject).output = { changed: true };
  await expectDatabaseCode("PT409", () =>
    ingest("lk_test_abcdefghijkl", digest, conflict),
  );
  await expectDatabaseCode("PT401", () =>
    ingest("lk_test_abcdefghijkl", "0".repeat(64), fixture),
  );

  const wrongService = structuredClone(fixture);
  (wrongService.producer as JsonObject).serviceName = "another-app";
  await expectDatabaseCode("PT400", () =>
    ingest("lk_test_abcdefghijkl", digest, wrongService),
  );

  await sql`
    update ledge_private.ledge_ingest_keys
       set revoked_at = now()
     where key_prefix = 'lk_test_abcdefghijkl'
  `;
  await expectDatabaseCode("PT401", () =>
    ingest("lk_test_abcdefghijkl", digest, fixture),
  );
  await sql`
    update ledge_private.ledge_ingest_keys
       set revoked_at = null
     where key_prefix = 'lk_test_abcdefghijkl'
  `;

  await assert.rejects(
    sql.begin(async (transaction) => {
      await transaction`set local role service_role`;
      await transaction`select * from ledge_private.ledge_traces`;
    }),
    (error: unknown) => (error as { code?: string }).code === "42501",
  );

  const restPayload = structuredClone(fixture);
  (restPayload.trace as JsonObject).id = "46EAA457-FF17-4BCB-BCA8-FEAA551EF470";
  const restResult = await ingestThroughSupabase(
    {
      supabaseURL,
      supabaseSecretKey,
    },
    {
      keyPrefix: "lk_test_abcdefghijkl",
      secretDigestHex: digest,
      payload: restPayload,
    },
  );
  assert.equal(restResult.outcome, "inserted");

  const handlerPayload = structuredClone(fixture);
  const handlerTraceID = "83A1A8C0-13E5-42A9-BCF0-02F9B419415D";
  (handlerPayload.trace as JsonObject).id = handlerTraceID;
  const handlerRequest = () =>
    new Request("https://api.ledgekit.com/v1/traces", {
      method: "POST",
      headers: {
        Authorization: `Bearer lk_test_abcdefghijkl.${secret}`,
        "Content-Type": "application/json",
        "Idempotency-Key": handlerTraceID,
        "X-Ledge-Schema-Version": "1",
      },
      body: JSON.stringify(handlerPayload),
    });
  const handlerDependencies = {
    submit: (input: {
      keyPrefix: string;
      secretDigestHex: string;
      payload: JsonObject;
    }) =>
      ingestThroughSupabase(
        {
          supabaseURL,
          supabaseSecretKey,
        },
        input,
      ),
    telemetry: () => {},
  };
  assert.equal(
    (await handleTraceRequest(handlerRequest(), handlerDependencies)).status,
    201,
  );
  assert.equal(
    (await handleTraceRequest(handlerRequest(), handlerDependencies)).status,
    200,
  );

  const [deletedHandlerTrace] = await sql<{ deleted: boolean }[]>`
    select ledge_private.delete_trace(
      ${app.id}::uuid,
      ${handlerTraceID}::uuid
    ) as deleted
  `;
  assert.equal(deletedHandlerTrace?.deleted, true);

  await sql`
    update ledge_private.ledge_apps
       set retention_days = 1
     where id = ${app.id}::uuid
  `;
  await sql`
    update ledge_private.ledge_traces
       set received_at = now() - interval '2 days'
     where id = '46EAA457-FF17-4BCB-BCA8-FEAA551EF470'::uuid
  `;
  const [retention] = await sql<{ deleted: number }[]>`
    select ledge_private.delete_expired_traces()::integer as deleted
  `;
  assert.equal(retention?.deleted, 1);

  await assert.rejects(
    ingestThroughSupabase(
      {
        supabaseURL,
        supabaseSecretKey,
      },
      {
        keyPrefix: "lk_test_abcdefghijkl",
        secretDigestHex: "0".repeat(64),
        payload: fixture,
      },
    ),
    (error: unknown) =>
      error instanceof SupabaseRpcError && error.kind === "invalid_key",
  );

  await assert.rejects(
    sql.begin(async (transaction) => {
      await transaction`
        delete from ledge_private.ledge_ingest_keys
         where id = ${testKey.id}::uuid
      `;
    }),
    (error: unknown) => (error as { code?: string }).code === "23503",
  );

  console.log("database integration tests passed");
} finally {
  await sql.end();
}
