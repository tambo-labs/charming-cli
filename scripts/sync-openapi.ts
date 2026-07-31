import { createHash } from 'node:crypto';
import { writeFile } from 'node:fs/promises';

const source = 'https://charm.ing/.well-known/openapi.json';
const contractResponse = await fetch(source, {
  headers: { 'User-Agent': 'charming-cli-sync' },
});
if (!contractResponse.ok) {
  throw new Error(`Could not fetch the Charming OpenAPI contract: HTTP ${contractResponse.status}`);
}
const contract = await contractResponse.text();
JSON.parse(contract);
const sha256 = createHash('sha256').update(contract).digest('hex');

await writeFile('openapi.json', contract);
await writeFile(
  'UPSTREAM.json',
  `${JSON.stringify({ source, sha256 }, null, 2)}\n`,
);
console.log(`Synced Charming OpenAPI (${sha256}).`);
