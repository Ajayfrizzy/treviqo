import { S3Client } from "@aws-sdk/client-s3";
import { probeConfig, runDeleteProbe } from "./s3-delete-probe";
let client: S3Client | undefined;
try {
  const config = probeConfig(process.env, process.argv.slice(2));
  client = new S3Client(config.options);
  const ok = await runDeleteProbe(client, config.bucket, (event) =>
    console.log(JSON.stringify(event)),
  );
  if (!ok) process.exitCode = 1;
} catch {
  // Never print SDK/config exceptions, stacks, URLs, headers or environment values.
  console.error(
    '{"operation":"probe","outcome":"failed","category":"configuration_or_unexpected","operator_followup_required":true}',
  );
  process.exitCode = 1;
} finally {
  client?.destroy();
}
