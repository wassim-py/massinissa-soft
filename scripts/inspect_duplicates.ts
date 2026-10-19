/**
 * scripts/inspect_duplicates.ts
 * Detailed inspection and categorization of candidate duplicates vs siblings.
 */

import * as fs from 'fs';
import * as path from 'path';

const raw = fs.readFileSync(path.join(__dirname, 'duplicate_audit_result.json'), 'utf-8');
const data = JSON.parse(raw);

console.log('--- ALL 25 CERTAIN CANDIDATES ---');
data.duplicatesCertain.forEach((d: any, idx: number) => {
  console.log(`\n#${idx + 1}: ${d.reason}`);
  console.log(`  Student 1: [#${d.a.globalNumber}] "${d.a.name}" | Branch: ${d.a.branchName} | Phone: ${d.a.phone} | Vouchers: ${d.a.vouchersCount} | Classes: [${d.a.classes.join(', ')}] | Birthday: ${d.a.birthday ? d.a.birthday.slice(0, 10) : 'None'}`);
  console.log(`  Student 2: [#${d.b.globalNumber}] "${d.b.name}" | Branch: ${d.b.branchName} | Phone: ${d.b.phone} | Vouchers: ${d.b.vouchersCount} | Classes: [${d.b.classes.join(', ')}] | Birthday: ${d.b.birthday ? d.b.birthday.slice(0, 10) : 'None'}`);
});

console.log('\n\n--- ALL 15 PROBABLE CANDIDATES ---');
data.duplicatesProbable.forEach((d: any, idx: number) => {
  console.log(`\n#${idx + 1}: ${d.reason}`);
  console.log(`  Student 1: [#${d.a.globalNumber}] "${d.a.name}" | Branch: ${d.a.branchName} | Phone: ${d.a.phone} | Vouchers: ${d.a.vouchersCount} | Classes: [${d.a.classes.join(', ')}] | Birthday: ${d.a.birthday ? d.a.birthday.slice(0, 10) : 'None'}`);
  console.log(`  Student 2: [#${d.b.globalNumber}] "${d.b.name}" | Branch: ${d.b.branchName} | Phone: ${d.b.phone} | Vouchers: ${d.b.vouchersCount} | Classes: [${d.b.classes.join(', ')}] | Birthday: ${d.b.birthday ? d.b.birthday.slice(0, 10) : 'None'}`);
});

console.log('\n\n--- ALL 6 HOMONYMS ACROSS BRANCHES ---');
data.exactNameDifferentPhone.forEach((d: any, idx: number) => {
  console.log(`\n#${idx + 1}: ${d.reason}`);
  console.log(`  Student 1: [#${d.a.globalNumber}] "${d.a.name}" | Branch: ${d.a.branchName} | Phone: ${d.a.phone} | Vouchers: ${d.a.vouchersCount} | Classes: [${d.a.classes.join(', ')}] | Birthday: ${d.a.birthday ? d.a.birthday.slice(0, 10) : 'None'}`);
  console.log(`  Student 2: [#${d.b.globalNumber}] "${d.b.name}" | Branch: ${d.b.branchName} | Phone: ${d.b.phone} | Vouchers: ${d.b.vouchersCount} | Classes: [${d.b.classes.join(', ')}] | Birthday: ${d.b.birthday ? d.b.birthday.slice(0, 10) : 'None'}`);
});
