import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const testsDir = path.resolve(__dirname);
const testFiles = fs.readdirSync(testsDir)
  .filter(f => f.endsWith('.ts') && f !== 'run_all_tests.ts')
  .sort();

console.log(`================================================================`);
console.log(`[TEST] SEQUENTIAL VERIFICATION OF ALL ${testFiles.length} TEST SUITES`);
console.log(`================================================================\n`);

interface Result {
  file: string;
  passed: boolean;
  durationMs: number;
  error?: string;
}

const results: Result[] = [];
let passedCount = 0;
let failedCount = 0;

for (let i = 0; i < testFiles.length; i++) {
  const file = testFiles[i];
  const fullPath = path.join(testsDir, file);
  process.stdout.write(`[${i + 1}/${testFiles.length}] Running ${file}... `);
  const start = Date.now();
  try {
    execSync(`npx tsx "${fullPath}"`, {
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60000,
      env: { ...process.env, CI: 'true', NODE_OPTIONS: '--max-old-space-size=2048' }
    });
    const durationMs = Date.now() - start;
    console.log(`[PASS] PASSED (${durationMs}ms)`);
    passedCount++;
    results.push({ file, passed: true, durationMs });
  } catch (err: any) {
    const durationMs = Date.now() - start;
    console.log(`[FAIL] FAILED (${durationMs}ms)`);
    const output = (err.stdout || '') + '\n' + (err.stderr || '') + '\n' + err.message;
    console.error(`\n--- ERROR IN ${file} ---\n${output}\n`);
    failedCount++;
    results.push({ file, passed: false, durationMs, error: output });
  }
}

console.log('\n================================================================');
console.log(`TEST RUNNER SUMMARY: ${passedCount}/${testFiles.length} PASSED (${failedCount} FAILED)`);
console.log('================================================================');

for (const r of results) {
  console.log(`  ${r.passed ? '[PASS] ' : '[FAIL] '} ${r.file.padEnd(55)} [${r.durationMs}ms]`);
}

if (failedCount > 0) {
  process.exit(1);
} else {
  process.exit(0);
}
