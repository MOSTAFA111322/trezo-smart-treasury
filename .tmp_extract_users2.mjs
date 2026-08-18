import fs from 'node:fs';
const text = fs.readFileSync('client/src/pages/Workspace.tsx','utf8');
for (const marker of ['systemUsers.error','setOperationalRole','operationalRole']) {
  const index = text.indexOf(marker);
  console.log(`\n=== ${marker} @ ${index} ===\n` + text.slice(Math.max(0,index-300), Math.min(text.length,index+3200)));
}
