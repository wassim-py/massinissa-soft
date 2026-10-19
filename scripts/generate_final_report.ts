/**
 * scripts/generate_final_report.ts
 * Produces structured data for the final response.
 */

import * as fs from 'fs';
import * as path from 'path';

const raw = fs.readFileSync(path.join(__dirname, 'duplicate_audit_result.json'), 'utf-8');
const data = JSON.parse(raw);

// Let's filter true duplicates from siblings
// True duplicates are where the FIRST name and LAST name point to the SAME individual
// (identical name, inverted name, typo in name, nickname/compound name, same student across branches)

console.log('Total students analyzed:', data.totalStudents);
console.log('Certain candidates:', data.duplicatesCertain.length);
console.log('Probable candidates:', data.duplicatesProbable.length);
console.log('Homonyms cross branch:', data.exactNameDifferentPhone.length);
