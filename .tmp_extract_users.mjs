import fs from 'node:fs';
const text = fs.readFileSync('client/src/pages/Workspace.tsx','utf8');
const markers = ['المستخدمون والصلاحيات','المستخدم الحالي','operationalRole','userRoles','إدارة المستخدمين'];
for (const marker of markers) {
  let from = 0;
  let count = 0;
  while (count < 3) {
    const index = text.indexOf(marker, from);
    if (index < 0) break;
    console.log(`\n=== ${marker} @ ${index} ===\n` + text.slice(Math.max(0,index-900), Math.min(text.length,index+1800)));
    from = index + marker.length;
    count += 1;
  }
}
