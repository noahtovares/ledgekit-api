import { readFile } from "node:fs/promises";

import { argument } from "./support.js";

const endpoint = argument("endpoint") ?? "http://localhost:3000/v1/traces";
const token = process.env.LEDGE_INGEST_KEY;
if (!token) throw new Error("missing_LEDGE_INGEST_KEY");

const fixtureURL = new URL("../test/fixtures/ledge-trace-v1.json", import.meta.url);
const body = await readFile(fixtureURL);
const fixture = JSON.parse(body.toString("utf8")) as {
  trace: { id: string };
};

const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "Idempotency-Key": fixture.trace.id,
    "X-Ledge-Schema-Version": "1",
  },
  body,
});

if (!response.ok) {
  throw new Error(`smoke_test_failed_${response.status}`);
}
console.log(response.status);
