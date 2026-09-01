import { argument, operatorDatabase, requiredArgument } from "./support.js";

const serviceName = requiredArgument("service");
const retentionDays = Number(argument("retention-days") ?? "30");
if (!Number.isSafeInteger(retentionDays) || retentionDays <= 0) {
  throw new Error("invalid_retention_days");
}
const sql = operatorDatabase();
try {
  const [app] = await sql<{ id: string }[]>`
    insert into ledge_private.ledge_apps (
      service_name,
      retention_days
    ) values (
      ${serviceName},
      ${retentionDays}
    )
    returning id
  `;
  if (!app) throw new Error("app_not_created");
  console.log(app.id);
} finally {
  await sql.end();
}
