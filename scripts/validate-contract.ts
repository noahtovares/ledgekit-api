import { readFile } from "node:fs/promises";

import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const schema = JSON.parse(
  await readFile(
    new URL("../schema/ledge-trace-v1.schema.json", import.meta.url),
    "utf8",
  ),
) as object;
const fixture = JSON.parse(
  await readFile(
    new URL("../test/fixtures/ledge-trace-v1.json", import.meta.url),
    "utf8",
  ),
) as unknown;

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
if (!ajv.validate(schema, fixture)) {
  throw new Error("contract_fixture_does_not_match_v1_schema");
}
console.log("contract fixture valid");
