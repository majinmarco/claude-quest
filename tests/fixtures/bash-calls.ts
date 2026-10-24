// Bash tool.call inputs and results recorded from Claude Code 2.1.308, every
// one a real run of the runner named (paths rewritten to /work/runners). Each
// is what a tool.call hook sees as `e` and what `next(e)` resolved to.
//
// A command that exits 0 resolves its record, { stdout, stderr, interrupted,
// ... }, with no exit code. One that exits non-zero resolves isError, its
// result the string "Error: Exit code N\n" + stdout + "\n" + stderr and its
// text the same without "Error: ". The runners: vitest 5.0.5, jest 30.5.2, pytest
// 9.1.1, tsc (TypeScript 7.0.2), eslint 10.13.0, biome 2.6.2, ruff 0.17.2.

export const vitestFailing3 = {
  "input": {
    "command": "cd /work/runners/vt && npx vitest run",
    "description": "Run vitest in vt runner",
    "tool": "Bash",
    "tool_use_id": "toolu_01JrLnfVVzkUq1aWj6LSXiW6"
  },
  "result": {
    "ref": 1,
    "result": "Error: Exit code 1\n\n RUN  v5.0.5 /work/runners/vt\n\n ❯ math.test.ts (5 tests | 3 failed) 5ms\n   ❯ add (5)\n     × adds negatives 3ms\n     × adds big 0ms\n     × adds floats 0ms\n\n⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯\n\n FAIL  math.test.ts > add > adds negatives\nAssertionError: expected -2 to be 3 // Object.is equality\n\n- Expected\n+ Received\n\n- 3\n+ -2\n\n ❯ math.test.ts:6:52\n      4|   test('adds two', () => expect(add(1, 1)).toBe(2))\n      5|   test('adds zero', () => expect(add(1, 0)).toBe(1))\n      6|   test('adds negatives', () => expect(add(-1, -1)).toBe(process.env.FI…\n       |                                                    ^\n      7|   test('adds big', () => expect(add(1e6, 1)).toBe(process.env.FIX2 ? 1…\n      8|   test('adds floats', () => expect(add(0.5, 0.5)).toBe(process.env.FIX…\n\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯\n\n FAIL  math.test.ts > add > adds big\nAssertionError: expected 1000001 to be 7 // Object.is equality\n\n- Expected\n+ Received\n\n- 7\n+ 1000001\n\n ❯ math.test.ts:7:46\n      5|   test('adds zero', () => expect(add(1, 0)).toBe(1))\n      6|   test('adds negatives', () => expect(add(-1, -1)).toBe(process.env.FI…\n      7|   test('adds big', () => expect(add(1e6, 1)).toBe(process.env.FIX2 ? 1…\n       |                                              ^\n      8|   test('adds floats', () => expect(add(0.5, 0.5)).toBe(process.env.FIX…\n      9| })\n\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯\n\n FAIL  math.test.ts > add > adds floats\nAssertionError: expected 1 to be 2 // Object.is equality\n\n- Expected\n+ Received\n\n- 2\n+ 1\n\n ❯ math.test.ts:8:51\n      6|   test('adds negatives', () => expect(add(-1, -1)).toBe(process.env.FI…\n      7|   test('adds big', () => expect(add(1e6, 1)).toBe(process.env.FIX2 ? 1…\n      8|   test('adds floats', () => expect(add(0.5, 0.5)).toBe(process.env.FIX…\n       |                                                   ^\n      9| })\n     10|\n\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯\n\n\n Test Files  1 failed (1)\n      Tests  3 failed | 2 passed (5)\n   Start at  20:01:12\n   Duration  83ms (transform 43%, import 24%, tests 22%, worker 11%)",
    "text": "Exit code 1\n\n RUN  v5.0.5 /work/runners/vt\n\n ❯ math.test.ts (5 tests | 3 failed) 5ms\n   ❯ add (5)\n     × adds negatives 3ms\n     × adds big 0ms\n     × adds floats 0ms\n\n⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯\n\n FAIL  math.test.ts > add > adds negatives\nAssertionError: expected -2 to be 3 // Object.is equality\n\n- Expected\n+ Received\n\n- 3\n+ -2\n\n ❯ math.test.ts:6:52\n      4|   test('adds two', () => expect(add(1, 1)).toBe(2))\n      5|   test('adds zero', () => expect(add(1, 0)).toBe(1))\n      6|   test('adds negatives', () => expect(add(-1, -1)).toBe(process.env.FI…\n       |                                                    ^\n      7|   test('adds big', () => expect(add(1e6, 1)).toBe(process.env.FIX2 ? 1…\n      8|   test('adds floats', () => expect(add(0.5, 0.5)).toBe(process.env.FIX…\n\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯\n\n FAIL  math.test.ts > add > adds big\nAssertionError: expected 1000001 to be 7 // Object.is equality\n\n- Expected\n+ Received\n\n- 7\n+ 1000001\n\n ❯ math.test.ts:7:46\n      5|   test('adds zero', () => expect(add(1, 0)).toBe(1))\n      6|   test('adds negatives', () => expect(add(-1, -1)).toBe(process.env.FI…\n      7|   test('adds big', () => expect(add(1e6, 1)).toBe(process.env.FIX2 ? 1…\n       |                                              ^\n      8|   test('adds floats', () => expect(add(0.5, 0.5)).toBe(process.env.FIX…\n      9| })\n\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯\n\n FAIL  math.test.ts > add > adds floats\nAssertionError: expected 1 to be 2 // Object.is equality\n\n- Expected\n+ Received\n\n- 2\n+ 1\n\n ❯ math.test.ts:8:51\n      6|   test('adds negatives', () => expect(add(-1, -1)).toBe(process.env.FI…\n      7|   test('adds big', () => expect(add(1e6, 1)).toBe(process.env.FIX2 ? 1…\n      8|   test('adds floats', () => expect(add(0.5, 0.5)).toBe(process.env.FIX…\n       |                                                   ^\n      9| })\n     10|\n\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯\n\n\n Test Files  1 failed (1)\n      Tests  3 failed | 2 passed (5)\n   Start at  20:01:12\n   Duration  83ms (transform 43%, import 24%, tests 22%, worker 11%)",
    "isError": true
  }
} as const

export const vitestFailing1 = {
  "input": {
    "command": "cd /work/runners/vt && FIX1=1 FIX2=1 npx vitest run",
    "description": "Run vitest with FIX1 and FIX2 set",
    "tool": "Bash",
    "tool_use_id": "toolu_01RfSqCmuEKagjTozgsBPsFD"
  },
  "result": {
    "ref": 1,
    "result": "Error: Exit code 1\n\n RUN  v5.0.5 /work/runners/vt\n\n ❯ math.test.ts (5 tests | 1 failed) 5ms\n   ❯ add (5)\n     × adds floats 3ms\n\n⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯\n\n FAIL  math.test.ts > add > adds floats\nAssertionError: expected 1 to be 2 // Object.is equality\n\n- Expected\n+ Received\n\n- 2\n+ 1\n\n ❯ math.test.ts:8:51\n      6|   test('adds negatives', () => expect(add(-1, -1)).toBe(process.env.FI…\n      7|   test('adds big', () => expect(add(1e6, 1)).toBe(process.env.FIX2 ? 1…\n      8|   test('adds floats', () => expect(add(0.5, 0.5)).toBe(process.env.FIX…\n       |                                                   ^\n      9| })\n     10|\n\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯\n\n\n Test Files  1 failed (1)\n      Tests  1 failed | 4 passed (5)\n   Start at  20:01:12\n   Duration  74ms (import 35%, tests 32%, transform 18%, worker 14%, environment 1%)",
    "text": "Exit code 1\n\n RUN  v5.0.5 /work/runners/vt\n\n ❯ math.test.ts (5 tests | 1 failed) 5ms\n   ❯ add (5)\n     × adds floats 3ms\n\n⎯⎯⎯⎯⎯⎯⎯ Failed Tests 1 ⎯⎯⎯⎯⎯⎯⎯\n\n FAIL  math.test.ts > add > adds floats\nAssertionError: expected 1 to be 2 // Object.is equality\n\n- Expected\n+ Received\n\n- 2\n+ 1\n\n ❯ math.test.ts:8:51\n      6|   test('adds negatives', () => expect(add(-1, -1)).toBe(process.env.FI…\n      7|   test('adds big', () => expect(add(1e6, 1)).toBe(process.env.FIX2 ? 1…\n      8|   test('adds floats', () => expect(add(0.5, 0.5)).toBe(process.env.FIX…\n       |                                                   ^\n      9| })\n     10|\n\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/1]⎯\n\n\n Test Files  1 failed (1)\n      Tests  1 failed | 4 passed (5)\n   Start at  20:01:12\n   Duration  74ms (import 35%, tests 32%, transform 18%, worker 14%, environment 1%)",
    "isError": true
  }
} as const

export const vitestPassing = {
  "input": {
    "command": "cd /work/runners/vt && FIX1=1 FIX2=1 FIX3=1 npx vitest run",
    "description": "Run vitest with FIX1, FIX2, FIX3 set",
    "tool": "Bash",
    "tool_use_id": "toolu_0159bxGpnRDXgsi3UoJxc5Rp"
  },
  "result": {
    "ref": 1,
    "result": {
      "stdout": " RUN  v5.0.5 /work/runners/vt\n\n\n Test Files  1 passed (1)\n      Tests  5 passed (5)\n   Start at  20:01:15\n   Duration  66ms (import 48%, transform 18%, worker 17%, tests 16%, environment 1%)",
      "stderr": "",
      "interrupted": false,
      "isImage": false,
      "noOutputExpected": false
    },
    "text": " RUN  v5.0.5 /work/runners/vt\n\n\n Test Files  1 passed (1)\n      Tests  5 passed (5)\n   Start at  20:01:15\n   Duration  66ms (import 48%, transform 18%, worker 17%, tests 16%, environment 1%)"
  }
} as const

export const npmTestFailing = {
  "input": {
    "command": "npm test",
    "description": "Run npm test in vt runner",
    "tool": "Bash",
    "tool_use_id": "toolu_018NXVbAfaaX1f7rPbqFChSF"
  },
  "result": {
    "ref": 1,
    "result": "Error: Exit code 1\n\n> test\n> vitest run\n\n\n RUN  v5.0.5 /work/runners/vt\n\n ❯ math.test.ts (5 tests | 3 failed) 6ms\n   ❯ add (5)\n     × adds negatives 3ms\n     × adds big 0ms\n     × adds floats 0ms\n\n⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯\n\n FAIL  math.test.ts > add > adds negatives\nAssertionError: expected -2 to be 3 // Object.is equality\n\n- Expected\n+ Received\n\n- 3\n+ -2\n\n ❯ math.test.ts:6:52\n      4|   test('adds two', () => expect(add(1, 1)).toBe(2))\n      5|   test('adds zero', () => expect(add(1, 0)).toBe(1))\n      6|   test('adds negatives', () => expect(add(-1, -1)).toBe(process.env.FI…\n       |                                                    ^\n      7|   test('adds big', () => expect(add(1e6, 1)).toBe(process.env.FIX2 ? 1…\n      8|   test('adds floats', () => expect(add(0.5, 0.5)).toBe(process.env.FIX…\n\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯\n\n FAIL  math.test.ts > add > adds big\nAssertionError: expected 1000001 to be 7 // Object.is equality\n\n- Expected\n+ Received\n\n- 7\n+ 1000001\n\n ❯ math.test.ts:7:46\n      5|   test('adds zero', () => expect(add(1, 0)).toBe(1))\n      6|   test('adds negatives', () => expect(add(-1, -1)).toBe(process.env.FI…\n      7|   test('adds big', () => expect(add(1e6, 1)).toBe(process.env.FIX2 ? 1…\n       |                                              ^\n      8|   test('adds floats', () => expect(add(0.5, 0.5)).toBe(process.env.FIX…\n      9| })\n\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯\n\n FAIL  math.test.ts > add > adds floats\nAssertionError: expected 1 to be 2 // Object.is equality\n\n- Expected\n+ Received\n\n- 2\n+ 1\n\n ❯ math.test.ts:8:51\n      6|   test('adds negatives', () => expect(add(-1, -1)).toBe(process.env.FI…\n      7|   test('adds big', () => expect(add(1e6, 1)).toBe(process.env.FIX2 ? 1…\n      8|   test('adds floats', () => expect(add(0.5, 0.5)).toBe(process.env.FIX…\n       |                                                   ^\n      9| })\n     10|\n\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯\n\n\n Test Files  1 failed (1)\n      Tests  3 failed | 2 passed (5)\n   Start at  20:01:16\n   Duration  82ms (import 36%, tests 34%, transform 16%, worker 13%)",
    "text": "Exit code 1\n\n> test\n> vitest run\n\n\n RUN  v5.0.5 /work/runners/vt\n\n ❯ math.test.ts (5 tests | 3 failed) 6ms\n   ❯ add (5)\n     × adds negatives 3ms\n     × adds big 0ms\n     × adds floats 0ms\n\n⎯⎯⎯⎯⎯⎯⎯ Failed Tests 3 ⎯⎯⎯⎯⎯⎯⎯\n\n FAIL  math.test.ts > add > adds negatives\nAssertionError: expected -2 to be 3 // Object.is equality\n\n- Expected\n+ Received\n\n- 3\n+ -2\n\n ❯ math.test.ts:6:52\n      4|   test('adds two', () => expect(add(1, 1)).toBe(2))\n      5|   test('adds zero', () => expect(add(1, 0)).toBe(1))\n      6|   test('adds negatives', () => expect(add(-1, -1)).toBe(process.env.FI…\n       |                                                    ^\n      7|   test('adds big', () => expect(add(1e6, 1)).toBe(process.env.FIX2 ? 1…\n      8|   test('adds floats', () => expect(add(0.5, 0.5)).toBe(process.env.FIX…\n\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[1/3]⎯\n\n FAIL  math.test.ts > add > adds big\nAssertionError: expected 1000001 to be 7 // Object.is equality\n\n- Expected\n+ Received\n\n- 7\n+ 1000001\n\n ❯ math.test.ts:7:46\n      5|   test('adds zero', () => expect(add(1, 0)).toBe(1))\n      6|   test('adds negatives', () => expect(add(-1, -1)).toBe(process.env.FI…\n      7|   test('adds big', () => expect(add(1e6, 1)).toBe(process.env.FIX2 ? 1…\n       |                                              ^\n      8|   test('adds floats', () => expect(add(0.5, 0.5)).toBe(process.env.FIX…\n      9| })\n\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[2/3]⎯\n\n FAIL  math.test.ts > add > adds floats\nAssertionError: expected 1 to be 2 // Object.is equality\n\n- Expected\n+ Received\n\n- 2\n+ 1\n\n ❯ math.test.ts:8:51\n      6|   test('adds negatives', () => expect(add(-1, -1)).toBe(process.env.FI…\n      7|   test('adds big', () => expect(add(1e6, 1)).toBe(process.env.FIX2 ? 1…\n      8|   test('adds floats', () => expect(add(0.5, 0.5)).toBe(process.env.FIX…\n       |                                                   ^\n      9| })\n     10|\n\n⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯⎯[3/3]⎯\n\n\n Test Files  1 failed (1)\n      Tests  3 failed | 2 passed (5)\n   Start at  20:01:16\n   Duration  82ms (import 36%, tests 34%, transform 16%, worker 13%)",
    "isError": true
  }
} as const

export const vitestNoTestFiles = {
  "input": {
    "command": "npx vitest run nothing",
    "description": "Run vitest with a filter matching nothing",
    "tool": "Bash",
    "tool_use_id": "toolu_015z7Mu1HzmqPQtnS9Nm51qV"
  },
  "result": {
    "ref": 1,
    "result": "Error: Exit code 1\n\n RUN  v5.0.5 /work/runners/vt\n\nNo test files found, exiting with code 1\n\nfilter: nothing\ninclude: **/*.{test,spec}.?(c|m)[jt]s?(x)\nexclude:  **/node_modules/**, **/.git/**",
    "text": "Exit code 1\n\n RUN  v5.0.5 /work/runners/vt\n\nNo test files found, exiting with code 1\n\nfilter: nothing\ninclude: **/*.{test,spec}.?(c|m)[jt]s?(x)\nexclude:  **/node_modules/**, **/.git/**",
    "isError": true
  }
} as const

export const jestFailing = {
  "input": {
    "command": "cd /work/runners/jt && npx jest",
    "description": "Run jest in jt runner",
    "tool": "Bash",
    "tool_use_id": "toolu_01WVHM3pijSEyYkCTCtZx3g4"
  },
  "result": {
    "ref": 1,
    "result": "Error: Exit code 1\nFAIL ./math.test.js\n  ● add › adds negatives\n\n    expect(received).toBe(expected) // Object.is equality\n\n    Expected: 3\n    Received: -2\n\n      3 |   test('adds two', () => expect(add(1, 1)).toBe(2))\n      4 |   test('adds zero', () => expect(add(1, 0)).toBe(1))\n    > 5 |   test('adds negatives', () => expect(add(-1, -1)).toBe(process.env.FIX1 ? -2 : 3))\n        |                                                    ^\n      6 |   test('adds big', () => expect(add(1e6, 1)).toBe(process.env.FIX2 ? 1000001 : 7))\n      7 |   test('adds floats', () => expect(add(0.5, 0.5)).toBe(process.env.FIX3 ? 1 : 2))\n      8 | })\n\n      at Object.toBe (math.test.js:5:52)\n\n  ● add › adds big\n\n    expect(received).toBe(expected) // Object.is equality\n\n    Expected: 7\n    Received: 1000001\n\n      4 |   test('adds zero', () => expect(add(1, 0)).toBe(1))\n      5 |   test('adds negatives', () => expect(add(-1, -1)).toBe(process.env.FIX1 ? -2 : 3))\n    > 6 |   test('adds big', () => expect(add(1e6, 1)).toBe(process.env.FIX2 ? 1000001 : 7))\n        |                                              ^\n      7 |   test('adds floats', () => expect(add(0.5, 0.5)).toBe(process.env.FIX3 ? 1 : 2))\n      8 | })\n      9 |\n\n      at Object.toBe (math.test.js:6:46)\n\n  ● add › adds floats\n\n    expect(received).toBe(expected) // Object.is equality\n\n    Expected: 2\n    Received: 1\n\n      5 |   test('adds negatives', () => expect(add(-1, -1)).toBe(process.env.FIX1 ? -2 : 3))\n      6 |   test('adds big', () => expect(add(1e6, 1)).toBe(process.env.FIX2 ? 1000001 : 7))\n    > 7 |   test('adds floats', () => expect(add(0.5, 0.5)).toBe(process.env.FIX3 ? 1 : 2))\n        |                                                   ^\n      8 | })\n      9 |\n\n      at Object.toBe (math.test.js:7:51)\n\nTest Suites: 1 failed, 1 total\nTests:       3 failed, 2 passed, 5 total\nSnapshots:   0 total\nTime:        0.098 s, estimated 1 s\nRan all test suites.",
    "text": "Exit code 1\nFAIL ./math.test.js\n  ● add › adds negatives\n\n    expect(received).toBe(expected) // Object.is equality\n\n    Expected: 3\n    Received: -2\n\n      3 |   test('adds two', () => expect(add(1, 1)).toBe(2))\n      4 |   test('adds zero', () => expect(add(1, 0)).toBe(1))\n    > 5 |   test('adds negatives', () => expect(add(-1, -1)).toBe(process.env.FIX1 ? -2 : 3))\n        |                                                    ^\n      6 |   test('adds big', () => expect(add(1e6, 1)).toBe(process.env.FIX2 ? 1000001 : 7))\n      7 |   test('adds floats', () => expect(add(0.5, 0.5)).toBe(process.env.FIX3 ? 1 : 2))\n      8 | })\n\n      at Object.toBe (math.test.js:5:52)\n\n  ● add › adds big\n\n    expect(received).toBe(expected) // Object.is equality\n\n    Expected: 7\n    Received: 1000001\n\n      4 |   test('adds zero', () => expect(add(1, 0)).toBe(1))\n      5 |   test('adds negatives', () => expect(add(-1, -1)).toBe(process.env.FIX1 ? -2 : 3))\n    > 6 |   test('adds big', () => expect(add(1e6, 1)).toBe(process.env.FIX2 ? 1000001 : 7))\n        |                                              ^\n      7 |   test('adds floats', () => expect(add(0.5, 0.5)).toBe(process.env.FIX3 ? 1 : 2))\n      8 | })\n      9 |\n\n      at Object.toBe (math.test.js:6:46)\n\n  ● add › adds floats\n\n    expect(received).toBe(expected) // Object.is equality\n\n    Expected: 2\n    Received: 1\n\n      5 |   test('adds negatives', () => expect(add(-1, -1)).toBe(process.env.FIX1 ? -2 : 3))\n      6 |   test('adds big', () => expect(add(1e6, 1)).toBe(process.env.FIX2 ? 1000001 : 7))\n    > 7 |   test('adds floats', () => expect(add(0.5, 0.5)).toBe(process.env.FIX3 ? 1 : 2))\n        |                                                   ^\n      8 | })\n      9 |\n\n      at Object.toBe (math.test.js:7:51)\n\nTest Suites: 1 failed, 1 total\nTests:       3 failed, 2 passed, 5 total\nSnapshots:   0 total\nTime:        0.098 s, estimated 1 s\nRan all test suites.",
    "isError": true
  }
} as const

export const jestPassing = {
  "input": {
    "command": "cd /work/runners/jt && FIX1=1 FIX2=1 FIX3=1 npx jest",
    "description": "Run jest with FIX1, FIX2, FIX3 set",
    "tool": "Bash",
    "tool_use_id": "toolu_019gF7xeQVqe4EKYn5odTvj3"
  },
  "result": {
    "ref": 1,
    "result": {
      "stdout": "Test Suites: 1 passed, 1 total\nTests:       5 passed, 5 total\nSnapshots:   0 total\nTime:        0.092 s, estimated 1 s\nRan all test suites.",
      "stderr": "",
      "interrupted": false,
      "isImage": false,
      "noOutputExpected": false
    },
    "text": "Test Suites: 1 passed, 1 total\nTests:       5 passed, 5 total\nSnapshots:   0 total\nTime:        0.092 s, estimated 1 s\nRan all test suites."
  }
} as const

export const jestSuiteBroken = {
  "input": {
    "command": "cd /work/runners/jtbroken && npx jest",
    "description": "Run jest in jtbroken runner",
    "tool": "Bash",
    "tool_use_id": "toolu_012AHkwtYon1Q4dJe9XyZZtX"
  },
  "result": {
    "ref": 1,
    "result": "Error: Exit code 1\nFAIL ./broken.test.js\n  ● Test suite failed to run\n\n    Jest encountered an unexpected token\n\n    Jest failed to parse a file. This happens e.g. when your code or its dependencies use non-standard JavaScript syntax, or when Jest is not configured to support such syntax.\n\n    Out of the box Jest supports Babel, which will be used to transform your files into valid JS based on your Babel configuration.\n\n    By default \"node_modules\" folder is ignored by transformers.\n\n    Here's what you can do:\n     • If you are trying to use TypeScript, see https://jestjs.io/docs/getting-started#using-typescript\n     • To have some of your \"node_modules\" files transformed, you can specify a custom \"transformIgnorePatterns\" in your config.\n     • If you need a custom transformation, specify a \"transform\" option in your config.\n     • If you simply want to mock your non-JS modules (e.g. binary assets) you can stub them out with the \"moduleNameMapper\" config option.\n\n    You'll find more details and examples of these config options in the docs:\n    https://jestjs.io/docs/configuration\n    For information about custom transformations, see:\n    https://jestjs.io/docs/code-transformation\n\n    Details:\n\n    SyntaxError: /work/runners/jtbroken/broken.test.js: Unexpected token (4:0)\n\n      2 |   test('y', () => {\n      3 |     expect(1).toBe(1)\n    > 4 |\n        | ^\n\n      at constructor (../node_modules/@babel/parser/src/parse-error.ts:96:45)\n      at Parser.toParseError [as raise] (../node_modules/@babel/parser/src/tokenizer/index.ts:1509:19)\n      at Parser.raise [as unexpected] (../node_modules/@babel/parser/src/tokenizer/index.ts:1549:16)\n      at Parser.unexpected [as parseExprAtom] (../node_modules/@babel/parser/src/parser/expression.ts:1415:22)\n      at Parser.parseExprAtom [as parseExprSubscripts] (../node_modules/@babel/parser/src/parser/expression.ts:772:23)\n      at Parser.parseExprSubscripts [as parseUpdate] (../node_modules/@babel/parser/src/parser/expression.ts:751:21)\n      at Parser.parseUpdate [as parseMaybeUnary] (../node_modules/@babel/parser/src/parser/expression.ts:713:23)\n      at Parser.parseMaybeUnary [as parseMaybeUnaryOrPrivate] (../node_modules/@babel/parser/src/parser/expression.ts:427:14)\n      at Parser.parseMaybeUnaryOrPrivate [as parseExprOps] (../node_modules/@babel/parser/src/parser/expression.ts:439:23)\n      at Parser.parseExprOps [as parseMaybeConditional] (../node_modules/@babel/parser/src/parser/expression.ts:394:23)\n      at Parser.parseMaybeConditional [as parseMaybeAssign] (../node_modules/@babel/parser/src/parser/expression.ts:302:21)\n      at Parser.parseMaybeAssign [as parseExpressionBase] (../node_modules/@babel/parser/src/parser/expression.ts:227:23)\n      at parseExpressionBase (../node_modules/@babel/parser/src/parser/expression.ts:218:39)\n      at Parser.callback [as allowInAnd] (../node_modules/@babel/parser/src/parser/expression.ts:3259:16)\n      at Parser.allowInAnd [as parseExpression] (../node_modules/@babel/parser/src/parser/expression.ts:218:17)\n      at Parser.parseExpression [as parseStatementContent] (../node_modules/@babel/parser/src/parser/statement.ts:699:23)\n      at Parser.parseStatementContent [as parseStatementLike] (../node_modules/@babel/parser/src/parser/statement.ts:485:17)\n      at Parser.parseStatementLike [as parseStatementListItem] (../node_modules/@babel/parser/src/parser/statement.ts:434:17)\n      at Parser.parseStatementListItem [as parseBlockOrModuleBlockBody] (../node_modules/@babel/parser/src/parser/statement.ts:1466:16)\n      at Parser.parseBlockOrModuleBlockBody [as parseBlockBody] (../node_modules/@babel/parser/src/parser/statement.ts:1439:10)\n      at Parser.parseBlockBody [as parseBlock] (../node_modules/@babel/parser/src/parser/statement.ts:1407:10)\n      at Parser.parseBlock [as parseFunctionBody] (../node_modules/@babel/parser/src/parser/expression.ts:2685:24)\n      at Parser.parseFunctionBody [as parseArrowExpression] (../node_modules/@babel/parser/src/parser/expression.ts:2623:10)\n      at Parser.parseArrowExpression [as parseParenAndDistinguishExpression] (../node_modules/@babel/parser/src/parser/expression.ts:1907:12)\n      at Parser.parseParenAndDistinguishExpression [as parseExprAtom] (../node_modules/@babel/parser/src/parser/expression.ts:1227:21)\n      at Parser.parseExprAtom [as parseExprSubscripts] (../node_modules/@babel/parser/src/parser/expression.ts:772:23)\n      at Parser.parseExprSubscripts [as parseUpdate] (../node_modules/@babel/parser/src/parser/expression.ts:751:21)\n      at Parser.parseUpdate [as parseMaybeUnary] (../node_modules/@babel/parser/src/parser/expression.ts:713:23)\n      at Parser.parseMaybeUnary [as parseMaybeUnaryOrPrivate] (../node_modules/@babel/parser/src/parser/expression.ts:427:14)\n      at Parser.parseMaybeUnaryOrPrivate [as parseExprOps] (../node_modules/@babel/parser/src/parser/expression.ts:439:2\n\n... [3407 characters truncated] ...\n\n  at Parser.parseBlock [as parseFunctionBody] (../node_modules/@babel/parser/src/parser/expression.ts:2685:24)\n      at Parser.parseFunctionBody [as parseArrowExpression] (../node_modules/@babel/parser/src/parser/expression.ts:2623:10)\n      at Parser.parseArrowExpression [as parseParenAndDistinguishExpression] (../node_modules/@babel/parser/src/parser/expression.ts:1907:12)\n      at Parser.parseParenAndDistinguishExpression [as parseExprAtom] (../node_modules/@babel/parser/src/parser/expression.ts:1227:21)\n      at Parser.parseExprAtom [as parseExprSubscripts] (../node_modules/@babel/parser/src/parser/expression.ts:772:23)\n      at Parser.parseExprSubscripts [as parseUpdate] (../node_modules/@babel/parser/src/parser/expression.ts:751:21)\n      at Parser.parseUpdate [as parseMaybeUnary] (../node_modules/@babel/parser/src/parser/expression.ts:713:23)\n      at Parser.parseMaybeUnary [as parseMaybeUnaryOrPrivate] (../node_modules/@babel/parser/src/parser/expression.ts:427:14)\n      at Parser.parseMaybeUnaryOrPrivate [as parseExprOps] (../node_modules/@babel/parser/src/parser/expression.ts:439:23)\n      at Parser.parseExprOps [as parseMaybeConditional] (../node_modules/@babel/parser/src/parser/expression.ts:394:23)\n      at Parser.parseMaybeConditional [as parseMaybeAssign] (../node_modules/@babel/parser/src/parser/expression.ts:302:21)\n      at parseMaybeAssign (../node_modules/@babel/parser/src/parser/expression.ts:258:12)\n      at Parser.callback [as allowInAnd] (../node_modules/@babel/parser/src/parser/expression.ts:3264:12)\n      at Parser.allowInAnd [as parseMaybeAssignAllowIn] (../node_modules/@babel/parser/src/parser/expression.ts:257:17)\n      at Parser.parseMaybeAssignAllowIn [as parseMaybeAssignAllowInOrVoidPattern] (../node_modules/@babel/parser/src/parser/expression.ts:3378:17)\n      at Parser.parseMaybeAssignAllowInOrVoidPattern [as parseExprListItem] (../node_modules/@babel/parser/src/parser/expression.ts:2857:18)\n      at Parser.parseExprListItem [as parseCallExpressionArguments] (../node_modules/@babel/parser/src/parser/expression.ts:1099:14)\n      at Parser.parseCallExpressionArguments [as parseCoverCallAndAsyncArrowHead] (../node_modules/@babel/parser/src/parser/expression.ts:979:29)\n      at Parser.parseCoverCallAndAsyncArrowHead [as parseSubscript] (../node_modules/@babel/parser/src/parser/expression.ts:852:19)\n      at Parser.parseSubscript [as parseSubscripts] (../node_modules/@babel/parser/src/parser/expression.ts:811:19)\n      at Parser.parseSubscripts [as parseExprSubscripts] (../node_modules/@babel/parser/src/parser/expression.ts:778:17)\n      at Parser.parseExprSubscripts [as parseUpdate] (../node_modules/@babel/parser/src/parser/expression.ts:751:21)\n      at Parser.parseUpdate [as parseMaybeUnary] (../node_modules/@babel/parser/src/parser/expression.ts:713:23)\n      at Parser.parseMaybeUnary [as parseMaybeUnaryOrPrivate] (../node_modules/@babel/parser/src/parser/expression.ts:427:14)\n      at Parser.parseMaybeUnaryOrPrivate [as parseExprOps] (../node_modules/@babel/parser/src/parser/expression.ts:439:23)\n      at Parser.parseExprOps [as parseMaybeConditional] (../node_modules/@babel/parser/src/parser/expression.ts:394:23)\n      at Parser.parseMaybeConditional [as parseMaybeAssign] (../node_modules/@babel/parser/src/parser/expression.ts:302:21)\n      at Parser.parseMaybeAssign [as parseExpressionBase] (../node_modules/@babel/parser/src/parser/expression.ts:227:23)\n      at parseExpressionBase (../node_modules/@babel/parser/src/parser/expression.ts:218:39)\n      at Parser.callback [as allowInAnd] (../node_modules/@babel/parser/src/parser/expression.ts:3259:16)\n      at Parser.allowInAnd [as parseExpression] (../node_modules/@babel/parser/src/parser/expression.ts:218:17)\n      at Parser.parseExpression [as parseStatementContent] (../node_modules/@babel/parser/src/parser/statement.ts:699:23)\n      at Parser.parseStatementContent [as parseStatementLike] (../node_modules/@babel/parser/src/parser/statement.ts:485:17)\n      at Parser.parseStatementLike [as parseModuleItem] (../node_modules/@babel/parser/src/parser/statement.ts:422:17)\n      at Parser.parseModuleItem [as parseBlockOrModuleBlockBody] (../node_modules/@babel/parser/src/parser/statement.ts:1465:16)\n      at Parser.parseBlockOrModuleBlockBody [as parseBlockBody] (../node_modules/@babel/parser/src/parser/statement.ts:1439:10)\n      at Parser.parseBlockBody [as parseProgram] (../node_modules/@babel/parser/src/parser/statement.ts:232:10)\n      at Parser.parseProgram [as parseTopLevel] (../node_modules/@babel/parser/src/parser/statement.ts:206:25)\n      at Parser.parseTopLevel [as parse] (../node_modules/@babel/parser/src/parser/index.ts:83:25)\n      at parse (../node_modules/@babel/parser/src/index.ts:86:38)\n      at parser (../node_modules/@babel/core/src/parser/index.ts:29:19)\n          at parser.next (<anonymous>)\n\nTest Suites: 1 failed, 1 total\nTests:       0 total\nSnapshots:   0 total\nTime:        0.153 s\nRan all test suites.",
    "text": "Exit code 1\nFAIL ./broken.test.js\n  ● Test suite failed to run\n\n    Jest encountered an unexpected token\n\n    Jest failed to parse a file. This happens e.g. when your code or its dependencies use non-standard JavaScript syntax, or when Jest is not configured to support such syntax.\n\n    Out of the box Jest supports Babel, which will be used to transform your files into valid JS based on your Babel configuration.\n\n    By default \"node_modules\" folder is ignored by transformers.\n\n    Here's what you can do:\n     • If you are trying to use TypeScript, see https://jestjs.io/docs/getting-started#using-typescript\n     • To have some of your \"node_modules\" files transformed, you can specify a custom \"transformIgnorePatterns\" in your config.\n     • If you need a custom transformation, specify a \"transform\" option in your config.\n     • If you simply want to mock your non-JS modules (e.g. binary assets) you can stub them out with the \"moduleNameMapper\" config option.\n\n    You'll find more details and examples of these config options in the docs:\n    https://jestjs.io/docs/configuration\n    For information about custom transformations, see:\n    https://jestjs.io/docs/code-transformation\n\n    Details:\n\n    SyntaxError: /work/runners/jtbroken/broken.test.js: Unexpected token (4:0)\n\n      2 |   test('y', () => {\n      3 |     expect(1).toBe(1)\n    > 4 |\n        | ^\n\n      at constructor (../node_modules/@babel/parser/src/parse-error.ts:96:45)\n      at Parser.toParseError [as raise] (../node_modules/@babel/parser/src/tokenizer/index.ts:1509:19)\n      at Parser.raise [as unexpected] (../node_modules/@babel/parser/src/tokenizer/index.ts:1549:16)\n      at Parser.unexpected [as parseExprAtom] (../node_modules/@babel/parser/src/parser/expression.ts:1415:22)\n      at Parser.parseExprAtom [as parseExprSubscripts] (../node_modules/@babel/parser/src/parser/expression.ts:772:23)\n      at Parser.parseExprSubscripts [as parseUpdate] (../node_modules/@babel/parser/src/parser/expression.ts:751:21)\n      at Parser.parseUpdate [as parseMaybeUnary] (../node_modules/@babel/parser/src/parser/expression.ts:713:23)\n      at Parser.parseMaybeUnary [as parseMaybeUnaryOrPrivate] (../node_modules/@babel/parser/src/parser/expression.ts:427:14)\n      at Parser.parseMaybeUnaryOrPrivate [as parseExprOps] (../node_modules/@babel/parser/src/parser/expression.ts:439:23)\n      at Parser.parseExprOps [as parseMaybeConditional] (../node_modules/@babel/parser/src/parser/expression.ts:394:23)\n      at Parser.parseMaybeConditional [as parseMaybeAssign] (../node_modules/@babel/parser/src/parser/expression.ts:302:21)\n      at Parser.parseMaybeAssign [as parseExpressionBase] (../node_modules/@babel/parser/src/parser/expression.ts:227:23)\n      at parseExpressionBase (../node_modules/@babel/parser/src/parser/expression.ts:218:39)\n      at Parser.callback [as allowInAnd] (../node_modules/@babel/parser/src/parser/expression.ts:3259:16)\n      at Parser.allowInAnd [as parseExpression] (../node_modules/@babel/parser/src/parser/expression.ts:218:17)\n      at Parser.parseExpression [as parseStatementContent] (../node_modules/@babel/parser/src/parser/statement.ts:699:23)\n      at Parser.parseStatementContent [as parseStatementLike] (../node_modules/@babel/parser/src/parser/statement.ts:485:17)\n      at Parser.parseStatementLike [as parseStatementListItem] (../node_modules/@babel/parser/src/parser/statement.ts:434:17)\n      at Parser.parseStatementListItem [as parseBlockOrModuleBlockBody] (../node_modules/@babel/parser/src/parser/statement.ts:1466:16)\n      at Parser.parseBlockOrModuleBlockBody [as parseBlockBody] (../node_modules/@babel/parser/src/parser/statement.ts:1439:10)\n      at Parser.parseBlockBody [as parseBlock] (../node_modules/@babel/parser/src/parser/statement.ts:1407:10)\n      at Parser.parseBlock [as parseFunctionBody] (../node_modules/@babel/parser/src/parser/expression.ts:2685:24)\n      at Parser.parseFunctionBody [as parseArrowExpression] (../node_modules/@babel/parser/src/parser/expression.ts:2623:10)\n      at Parser.parseArrowExpression [as parseParenAndDistinguishExpression] (../node_modules/@babel/parser/src/parser/expression.ts:1907:12)\n      at Parser.parseParenAndDistinguishExpression [as parseExprAtom] (../node_modules/@babel/parser/src/parser/expression.ts:1227:21)\n      at Parser.parseExprAtom [as parseExprSubscripts] (../node_modules/@babel/parser/src/parser/expression.ts:772:23)\n      at Parser.parseExprSubscripts [as parseUpdate] (../node_modules/@babel/parser/src/parser/expression.ts:751:21)\n      at Parser.parseUpdate [as parseMaybeUnary] (../node_modules/@babel/parser/src/parser/expression.ts:713:23)\n      at Parser.parseMaybeUnary [as parseMaybeUnaryOrPrivate] (../node_modules/@babel/parser/src/parser/expression.ts:427:14)\n      at Parser.parseMaybeUnaryOrPrivate [as parseExprOps] (../node_modules/@babel/parser/src/parser/expression.ts:439:2\n\n... [3407 characters truncated] ...\n\n  at Parser.parseBlock [as parseFunctionBody] (../node_modules/@babel/parser/src/parser/expression.ts:2685:24)\n      at Parser.parseFunctionBody [as parseArrowExpression] (../node_modules/@babel/parser/src/parser/expression.ts:2623:10)\n      at Parser.parseArrowExpression [as parseParenAndDistinguishExpression] (../node_modules/@babel/parser/src/parser/expression.ts:1907:12)\n      at Parser.parseParenAndDistinguishExpression [as parseExprAtom] (../node_modules/@babel/parser/src/parser/expression.ts:1227:21)\n      at Parser.parseExprAtom [as parseExprSubscripts] (../node_modules/@babel/parser/src/parser/expression.ts:772:23)\n      at Parser.parseExprSubscripts [as parseUpdate] (../node_modules/@babel/parser/src/parser/expression.ts:751:21)\n      at Parser.parseUpdate [as parseMaybeUnary] (../node_modules/@babel/parser/src/parser/expression.ts:713:23)\n      at Parser.parseMaybeUnary [as parseMaybeUnaryOrPrivate] (../node_modules/@babel/parser/src/parser/expression.ts:427:14)\n      at Parser.parseMaybeUnaryOrPrivate [as parseExprOps] (../node_modules/@babel/parser/src/parser/expression.ts:439:23)\n      at Parser.parseExprOps [as parseMaybeConditional] (../node_modules/@babel/parser/src/parser/expression.ts:394:23)\n      at Parser.parseMaybeConditional [as parseMaybeAssign] (../node_modules/@babel/parser/src/parser/expression.ts:302:21)\n      at parseMaybeAssign (../node_modules/@babel/parser/src/parser/expression.ts:258:12)\n      at Parser.callback [as allowInAnd] (../node_modules/@babel/parser/src/parser/expression.ts:3264:12)\n      at Parser.allowInAnd [as parseMaybeAssignAllowIn] (../node_modules/@babel/parser/src/parser/expression.ts:257:17)\n      at Parser.parseMaybeAssignAllowIn [as parseMaybeAssignAllowInOrVoidPattern] (../node_modules/@babel/parser/src/parser/expression.ts:3378:17)\n      at Parser.parseMaybeAssignAllowInOrVoidPattern [as parseExprListItem] (../node_modules/@babel/parser/src/parser/expression.ts:2857:18)\n      at Parser.parseExprListItem [as parseCallExpressionArguments] (../node_modules/@babel/parser/src/parser/expression.ts:1099:14)\n      at Parser.parseCallExpressionArguments [as parseCoverCallAndAsyncArrowHead] (../node_modules/@babel/parser/src/parser/expression.ts:979:29)\n      at Parser.parseCoverCallAndAsyncArrowHead [as parseSubscript] (../node_modules/@babel/parser/src/parser/expression.ts:852:19)\n      at Parser.parseSubscript [as parseSubscripts] (../node_modules/@babel/parser/src/parser/expression.ts:811:19)\n      at Parser.parseSubscripts [as parseExprSubscripts] (../node_modules/@babel/parser/src/parser/expression.ts:778:17)\n      at Parser.parseExprSubscripts [as parseUpdate] (../node_modules/@babel/parser/src/parser/expression.ts:751:21)\n      at Parser.parseUpdate [as parseMaybeUnary] (../node_modules/@babel/parser/src/parser/expression.ts:713:23)\n      at Parser.parseMaybeUnary [as parseMaybeUnaryOrPrivate] (../node_modules/@babel/parser/src/parser/expression.ts:427:14)\n      at Parser.parseMaybeUnaryOrPrivate [as parseExprOps] (../node_modules/@babel/parser/src/parser/expression.ts:439:23)\n      at Parser.parseExprOps [as parseMaybeConditional] (../node_modules/@babel/parser/src/parser/expression.ts:394:23)\n      at Parser.parseMaybeConditional [as parseMaybeAssign] (../node_modules/@babel/parser/src/parser/expression.ts:302:21)\n      at Parser.parseMaybeAssign [as parseExpressionBase] (../node_modules/@babel/parser/src/parser/expression.ts:227:23)\n      at parseExpressionBase (../node_modules/@babel/parser/src/parser/expression.ts:218:39)\n      at Parser.callback [as allowInAnd] (../node_modules/@babel/parser/src/parser/expression.ts:3259:16)\n      at Parser.allowInAnd [as parseExpression] (../node_modules/@babel/parser/src/parser/expression.ts:218:17)\n      at Parser.parseExpression [as parseStatementContent] (../node_modules/@babel/parser/src/parser/statement.ts:699:23)\n      at Parser.parseStatementContent [as parseStatementLike] (../node_modules/@babel/parser/src/parser/statement.ts:485:17)\n      at Parser.parseStatementLike [as parseModuleItem] (../node_modules/@babel/parser/src/parser/statement.ts:422:17)\n      at Parser.parseModuleItem [as parseBlockOrModuleBlockBody] (../node_modules/@babel/parser/src/parser/statement.ts:1465:16)\n      at Parser.parseBlockOrModuleBlockBody [as parseBlockBody] (../node_modules/@babel/parser/src/parser/statement.ts:1439:10)\n      at Parser.parseBlockBody [as parseProgram] (../node_modules/@babel/parser/src/parser/statement.ts:232:10)\n      at Parser.parseProgram [as parseTopLevel] (../node_modules/@babel/parser/src/parser/statement.ts:206:25)\n      at Parser.parseTopLevel [as parse] (../node_modules/@babel/parser/src/parser/index.ts:83:25)\n      at parse (../node_modules/@babel/parser/src/index.ts:86:38)\n      at parser (../node_modules/@babel/core/src/parser/index.ts:29:19)\n          at parser.next (<anonymous>)\n\nTest Suites: 1 failed, 1 total\nTests:       0 total\nSnapshots:   0 total\nTime:        0.153 s\nRan all test suites.",
    "isError": true
  }
} as const

export const pytestFailing = {
  "input": {
    "command": "cd /work/runners/py && ../venv/bin/pytest",
    "description": "Run pytest in py runner",
    "tool": "Bash",
    "tool_use_id": "toolu_01VK17JZDDWu7wpunu8dMP32"
  },
  "result": {
    "ref": 1,
    "result": "Error: Exit code 1\n============================= test session starts ==============================\nplatform linux -- Python 3.15.1, pytest-9.1.1, pluggy-1.7.0\nrootdir: /work/runners/py\ncollected 5 items\n\ntest_math.py ..FFF                                                       [100%]\n\n=================================== FAILURES ===================================\n________________________________ test_negatives ________________________________\n\n>   def test_negatives(): assert add(-1, -1) == (-2 if os.environ.get(\"FIX1\") else 3)\n                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\nE   assert -2 == 3\nE    +  where -2 = add(-1, -1)\n\ntest_math.py:5: AssertionError\n___________________________________ test_big ___________________________________\n\n>   def test_big(): assert add(10**6, 1) == (1000001 if os.environ.get(\"FIX2\") else 7)\n                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\nE   assert 1000001 == 7\nE    +  where 1000001 = add((10 ** 6), 1)\n\ntest_math.py:6: AssertionError\n_________________________________ test_floats __________________________________\n\n>   def test_floats(): assert add(0.5, 0.5) == (1 if os.environ.get(\"FIX3\") else 2)\n                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\nE   assert 1.0 == 2\nE    +  where 1.0 = add(0.5, 0.5)\n\ntest_math.py:7: AssertionError\n=========================== short test summary info ============================\nFAILED test_math.py::test_negatives - assert -2 == 3\nFAILED test_math.py::test_big - assert 1000001 == 7\nFAILED test_math.py::test_floats - assert 1.0 == 2\n========================= 3 failed, 2 passed in 0.01s ==========================",
    "text": "Exit code 1\n============================= test session starts ==============================\nplatform linux -- Python 3.15.1, pytest-9.1.1, pluggy-1.7.0\nrootdir: /work/runners/py\ncollected 5 items\n\ntest_math.py ..FFF                                                       [100%]\n\n=================================== FAILURES ===================================\n________________________________ test_negatives ________________________________\n\n>   def test_negatives(): assert add(-1, -1) == (-2 if os.environ.get(\"FIX1\") else 3)\n                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\nE   assert -2 == 3\nE    +  where -2 = add(-1, -1)\n\ntest_math.py:5: AssertionError\n___________________________________ test_big ___________________________________\n\n>   def test_big(): assert add(10**6, 1) == (1000001 if os.environ.get(\"FIX2\") else 7)\n                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\nE   assert 1000001 == 7\nE    +  where 1000001 = add((10 ** 6), 1)\n\ntest_math.py:6: AssertionError\n_________________________________ test_floats __________________________________\n\n>   def test_floats(): assert add(0.5, 0.5) == (1 if os.environ.get(\"FIX3\") else 2)\n                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\nE   assert 1.0 == 2\nE    +  where 1.0 = add(0.5, 0.5)\n\ntest_math.py:7: AssertionError\n=========================== short test summary info ============================\nFAILED test_math.py::test_negatives - assert -2 == 3\nFAILED test_math.py::test_big - assert 1000001 == 7\nFAILED test_math.py::test_floats - assert 1.0 == 2\n========================= 3 failed, 2 passed in 0.01s ==========================",
    "isError": true
  }
} as const

export const pytestPassing = {
  "input": {
    "command": "cd /work/runners/py && FIX1=1 FIX2=1 FIX3=1 ../venv/bin/pytest -q",
    "description": "Run pytest quietly with FIX1, FIX2, FIX3 set",
    "tool": "Bash",
    "tool_use_id": "toolu_0153zq6GYu2F7xVUxnXgTKtm"
  },
  "result": {
    "ref": 1,
    "result": {
      "stdout": ".....                                                                    [100%]\n5 passed in 0.00s",
      "stderr": "",
      "interrupted": false,
      "isImage": false,
      "noOutputExpected": false
    },
    "text": ".....                                                                    [100%]\n5 passed in 0.00s"
  }
} as const

export const pytestCollectionError = {
  "input": {
    "command": "cd /work/runners/pybroken && ../venv/bin/pytest",
    "description": "Run pytest in pybroken runner",
    "tool": "Bash",
    "tool_use_id": "toolu_01Gha9a8Rqba4jV6ttUXQunD"
  },
  "result": {
    "ref": 1,
    "result": "Error: Exit code 2\n============================= test session starts ==============================\nplatform linux -- Python 3.15.1, pytest-9.1.1, pluggy-1.7.0\nrootdir: /work/runners/pybroken\ncollected 0 items / 1 error\n\n==================================== ERRORS ====================================\n_______________________ ERROR collecting test_broken.py ________________________\n../venv/lib/python3.15/site-packages/_pytest/python.py:508: in importtestmodule\n    mod = import_path(\n../venv/lib/python3.15/site-packages/_pytest/pathlib.py:596: in import_path\n    importlib.import_module(module_name)\n/usr/lib/python3.15/importlib/__init__.py:88: in import_module\n    return _bootstrap._gcd_import(name[level:], package, level)\n           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n<frozen importlib._bootstrap>:1390: in _gcd_import\n    ???\n<frozen importlib._bootstrap>:1350: in _find_and_load\n    ???\n<frozen importlib._bootstrap>:1309: in _find_and_load_unlocked\n    ???\n<frozen importlib._bootstrap>:915: in _load_unlocked\n    ???\n../venv/lib/python3.15/site-packages/_pytest/assertion/rewrite.py:179: in exec_module\n    source_stat, co = _rewrite_test(fn, self.config)\n                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n../venv/lib/python3.15/site-packages/_pytest/assertion/rewrite.py:348: in _rewrite_test\n    tree = ast.parse(source, filename=strfn)\n           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n/usr/lib/python3.15/ast.py:46: in parse\n    return compile(source, filename, mode, flags,\nE     File \"/work/runners/pybroken/test_broken.py\", line 1\nE       def test_a(:\nE                  ^\nE   SyntaxError: invalid syntax\n=========================== short test summary info ============================\nERROR test_broken.py\n!!!!!!!!!!!!!!!!!!!! Interrupted: 1 error during collection !!!!!!!!!!!!!!!!!!!!\n=============================== 1 error in 0.07s ===============================",
    "text": "Exit code 2\n============================= test session starts ==============================\nplatform linux -- Python 3.15.1, pytest-9.1.1, pluggy-1.7.0\nrootdir: /work/runners/pybroken\ncollected 0 items / 1 error\n\n==================================== ERRORS ====================================\n_______________________ ERROR collecting test_broken.py ________________________\n../venv/lib/python3.15/site-packages/_pytest/python.py:508: in importtestmodule\n    mod = import_path(\n../venv/lib/python3.15/site-packages/_pytest/pathlib.py:596: in import_path\n    importlib.import_module(module_name)\n/usr/lib/python3.15/importlib/__init__.py:88: in import_module\n    return _bootstrap._gcd_import(name[level:], package, level)\n           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n<frozen importlib._bootstrap>:1390: in _gcd_import\n    ???\n<frozen importlib._bootstrap>:1350: in _find_and_load\n    ???\n<frozen importlib._bootstrap>:1309: in _find_and_load_unlocked\n    ???\n<frozen importlib._bootstrap>:915: in _load_unlocked\n    ???\n../venv/lib/python3.15/site-packages/_pytest/assertion/rewrite.py:179: in exec_module\n    source_stat, co = _rewrite_test(fn, self.config)\n                      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n../venv/lib/python3.15/site-packages/_pytest/assertion/rewrite.py:348: in _rewrite_test\n    tree = ast.parse(source, filename=strfn)\n           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n/usr/lib/python3.15/ast.py:46: in parse\n    return compile(source, filename, mode, flags,\nE     File \"/work/runners/pybroken/test_broken.py\", line 1\nE       def test_a(:\nE                  ^\nE   SyntaxError: invalid syntax\n=========================== short test summary info ============================\nERROR test_broken.py\n!!!!!!!!!!!!!!!!!!!! Interrupted: 1 error during collection !!!!!!!!!!!!!!!!!!!!\n=============================== 1 error in 0.07s ===============================",
    "isError": true
  }
} as const

export const tscFailing3 = {
  "input": {
    "command": "cd /work/runners/ts && npx tsc --noEmit bad3.ts",
    "description": "Type-check bad3.ts with tsc",
    "tool": "Bash",
    "tool_use_id": "toolu_017ZNMNk9uSfm3WoSBHgtNsa"
  },
  "result": {
    "ref": 1,
    "result": "Error: Exit code 1\nbad3.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.\nbad3.ts(2,7): error TS2322: Type 'number' is not assignable to type 'string'.\nbad3.ts(3,20): error TS2339: Property 'toUpperCase' does not exist on type 'number'.",
    "text": "Exit code 1\nbad3.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.\nbad3.ts(2,7): error TS2322: Type 'number' is not assignable to type 'string'.\nbad3.ts(3,20): error TS2339: Property 'toUpperCase' does not exist on type 'number'.",
    "isError": true
  }
} as const

export const tscFailing1 = {
  "input": {
    "command": "cd /work/runners/ts && npx tsc --noEmit bad1.ts",
    "description": "Type-check bad1.ts with tsc",
    "tool": "Bash",
    "tool_use_id": "toolu_01Bj9QGYcf5T91jE6MQmbgyE"
  },
  "result": {
    "ref": 1,
    "result": "Error: Exit code 1\nbad1.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.",
    "text": "Exit code 1\nbad1.ts(1,7): error TS2322: Type 'string' is not assignable to type 'number'.",
    "isError": true
  }
} as const

export const tscPassing = {
  "input": {
    "command": "cd /work/runners/ts && npx tsc --noEmit good.ts",
    "description": "Type-check good.ts with tsc",
    "tool": "Bash",
    "tool_use_id": "toolu_01KPGej7DNjHDrmv6mTTuuuQ"
  },
  "result": {
    "ref": 1,
    "result": {
      "stdout": "",
      "stderr": "",
      "interrupted": false,
      "isImage": false,
      "noOutputExpected": false
    },
    "text": "(Bash completed with no output)"
  }
} as const

export const eslintFailing = {
  "input": {
    "command": "cd /work/runners/lint && npx eslint bad.js",
    "description": "Lint bad.js with eslint",
    "tool": "Bash",
    "tool_use_id": "toolu_01Lo1AWLnPrK8buDeQiQxET9"
  },
  "result": {
    "ref": 1,
    "result": "Error: Exit code 1\n\n/work/runners/lint/bad.js\n  1:5   error    'unusedA' is assigned a value but never used        no-unused-vars\n  1:5   warning  'unusedA' is never reassigned. Use 'const' instead  prefer-const\n  2:11  error    'undefinedThing' is not defined                     no-undef\n  3:15  error    Unexpected 'debugger' statement                     no-debugger\n  4:5   warning  'c' is never reassigned. Use 'const' instead        prefer-const\n\n✖ 5 problems (3 errors, 2 warnings)\n  0 errors and 2 warnings potentially fixable with the `--fix` option.",
    "text": "Exit code 1\n\n/work/runners/lint/bad.js\n  1:5   error    'unusedA' is assigned a value but never used        no-unused-vars\n  1:5   warning  'unusedA' is never reassigned. Use 'const' instead  prefer-const\n  2:11  error    'undefinedThing' is not defined                     no-undef\n  3:15  error    Unexpected 'debugger' statement                     no-debugger\n  4:5   warning  'c' is never reassigned. Use 'const' instead        prefer-const\n\n✖ 5 problems (3 errors, 2 warnings)\n  0 errors and 2 warnings potentially fixable with the `--fix` option.",
    "isError": true
  }
} as const

export const eslintPassing = {
  "input": {
    "command": "cd /work/runners/lint && npx eslint good.js",
    "description": "Lint good.js with eslint",
    "tool": "Bash",
    "tool_use_id": "toolu_01GWfkxU4uirtT11Uf1PqXrr"
  },
  "result": {
    "ref": 1,
    "result": {
      "stdout": "",
      "stderr": "",
      "interrupted": false,
      "isImage": false,
      "noOutputExpected": false
    },
    "text": "(Bash completed with no output)"
  }
} as const

export const eslintCrashed = {
  "input": {
    "command": "npx eslint --config missing.mjs bad.js",
    "description": "Lint bad.js with a missing eslint config file",
    "tool": "Bash",
    "tool_use_id": "toolu_01Ao9X5yLANL9N7kqEbbwZ49"
  },
  "result": {
    "ref": 1,
    "result": "Error: Exit code 2\n\nOops! Something went wrong! :(\n\nESLint: 10.13.0\n\nError: ENOENT: no such file or directory, stat '/work/runners/lint/missing.mjs'\n    at async Object.stat (node:internal/fs/promises:1818:18)\n    at async loadConfigFile (/work/runners/node_modules/eslint/lib/config/config-loader.js:205:17)\n    at async ConfigLoader.calculateConfigArray (/work/runners/node_modules/eslint/lib/config/config-loader.js:594:23)\n    at async #calculateConfigArray (/work/runners/node_modules/eslint/lib/config/config-loader.js:369:19)\n    at async Promise.all (index 0)\n    at async findFiles (/work/runners/node_modules/eslint/lib/eslint/eslint-helpers.js:637:25)\n    at async ESLint.lintFiles (/work/runners/node_modules/eslint/lib/eslint/eslint.js:1025:21)\n    at async Object.execute (/work/runners/node_modules/eslint/lib/cli.js:386:14)\n    at async main (/work/runners/node_modules/eslint/bin/eslint.js:191:19)",
    "text": "Exit code 2\n\nOops! Something went wrong! :(\n\nESLint: 10.13.0\n\nError: ENOENT: no such file or directory, stat '/work/runners/lint/missing.mjs'\n    at async Object.stat (node:internal/fs/promises:1818:18)\n    at async loadConfigFile (/work/runners/node_modules/eslint/lib/config/config-loader.js:205:17)\n    at async ConfigLoader.calculateConfigArray (/work/runners/node_modules/eslint/lib/config/config-loader.js:594:23)\n    at async #calculateConfigArray (/work/runners/node_modules/eslint/lib/config/config-loader.js:369:19)\n    at async Promise.all (index 0)\n    at async findFiles (/work/runners/node_modules/eslint/lib/eslint/eslint-helpers.js:637:25)\n    at async ESLint.lintFiles (/work/runners/node_modules/eslint/lib/eslint/eslint.js:1025:21)\n    at async Object.execute (/work/runners/node_modules/eslint/lib/cli.js:386:14)\n    at async main (/work/runners/node_modules/eslint/bin/eslint.js:191:19)",
    "isError": true
  }
} as const

export const biomeFailing = {
  "input": {
    "command": "npx biome lint bad.js",
    "description": "Lint bad.js with biome",
    "tool": "Bash",
    "tool_use_id": "toolu_01PzDuyJdqjoqNkAPEoTegPS"
  },
  "result": {
    "ref": 1,
    "result": "Error: Exit code 1\nbad.js:1:1 lint/style/useConst  FIXABLE  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n  ! This let declares a variable that is only assigned once.\n  \n  > 1 │ let unusedA = 1\n      │ ^^^\n    2 │ const b = undefinedThing + 1\n    3 │ if (b == b) { debugger }\n  \n  i 'unusedA' is never reassigned.\n  \n  > 1 │ let unusedA = 1\n      │     ^^^^^^^\n    2 │ const b = undefinedThing + 1\n    3 │ if (b == b) { debugger }\n  \n  i A variable that is never reassigned is clearer as const, because it prevents the binding from being reassigned.\n  \n  i Safe fix: Use const instead.\n  \n    1   │ - let·unusedA·=·1\n      1 │ + const·unusedA·=·1\n    2 2 │   const b = undefinedThing + 1\n    3 3 │   if (b == b) { debugger }\n  \n\nbad.js:1:5 lint/correctness/noUnusedVariables  FIXABLE  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n  ! This variable unusedA is unused.\n  \n  > 1 │ let unusedA = 1\n      │     ^^^^^^^\n    2 │ const b = undefinedThing + 1\n    3 │ if (b == b) { debugger }\n  \n  i Unused variables are often the result of typos, incomplete refactors, or other sources of bugs.\n  \n  i Unsafe fix: If this is intentional, prepend unusedA with an underscore.\n  \n    1   │ - let·unusedA·=·1\n      1 │ + let·_unusedA·=·1\n    2 2 │   const b = undefinedThing + 1\n    3 3 │   if (b == b) { debugger }\n  \n\nbad.js:4:1 lint/style/useConst  FIXABLE  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n  ! This let declares a variable that is only assigned once.\n  \n    2 │ const b = undefinedThing + 1\n    3 │ if (b == b) { debugger }\n  > 4 │ let c = 2\n      │ ^^^\n    5 │ console.log(c)\n    6 │ \n  \n  i 'c' is never reassigned.\n  \n    2 │ const b = undefinedThing + 1\n    3 │ if (b == b) { debugger }\n  > 4 │ let c = 2\n      │     ^\n    5 │ console.log(c)\n    6 │ \n  \n  i A variable that is never reassigned is clearer as const, because it prevents the binding from being reassigned.\n  \n  i Safe fix: Use const instead.\n  \n    2 2 │   const b = undefinedThing + 1\n    3 3 │   if (b == b) { debugger }\n    4   │ - let·c·=·2\n      4 │ + const·c·=·2\n    5 5 │   console.log(c)\n    6 6 │   \n  \n\nbad.js:3:5 lint/suspicious/noSelfCompare ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n  × This comparison uses the same expression on both sides.\n  \n    1 │ let unusedA = 1\n    2 │ const b = undefinedThing + 1\n  > 3 │ if (b == b) { debugger }\n      │     ^^^^^^\n    4 │ let c = 2\n    5 │ console.log(c)\n  \n  i Self-comparisons are usually redundant or a sign that the wrong value is being compared.\n  \n  i Compare two different values instead, or use Number.isNaN() if you are checking for NaN.\n  \n\nbad.js:3:7 lint/suspicious/noDoubleEquals  FIXABLE  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n  × Using == may be unsafe if you are relying on type coercion.\n  \n    1 │ let unusedA = 1\n    2 │ const b = undefinedThing + 1\n  > 3 │ if (b == b) { debugger }\n      │       ^^\n    4 │ let c = 2\n    5 │ console.log(c)\n  \n  i == is only allowed when comparing against null.\n  \n  i Unsafe fix: Use === instead.\n  \n    3 │ if·(b·===·b)·{·debugger·}\n      │         +                \n\nbad.js:3:15 lint/suspicious/noDebugger  FIXABLE  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n  × This is an unexpected use of the debugger statement.\n  \n    1 │ let unusedA = 1\n    2 │ const b = undefinedThing + 1\n  > 3 │ if (b == b) { debugger }\n      │               ^^^^^^^^\n    4 │ let c = 2\n    5 │ console.log(c)\n  \n  i A debugger statement pauses the program when a debugger is open. It is meant for debugging only, and it should not be left in code that is shipped.\n  \n  i Unsafe fix: Remove debugger statement\n  \n    3 │ if·(b·==·b)·{·debugger·}\n      │               --------- \n\nChecked 1 file in 2ms. No fixes applied.\nFound 3 errors.\nFound 3 warnings.\nlint ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n  × Some errors were emitted while running checks.",
    "text": "Exit code 1\nbad.js:1:1 lint/style/useConst  FIXABLE  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n  ! This let declares a variable that is only assigned once.\n  \n  > 1 │ let unusedA = 1\n      │ ^^^\n    2 │ const b = undefinedThing + 1\n    3 │ if (b == b) { debugger }\n  \n  i 'unusedA' is never reassigned.\n  \n  > 1 │ let unusedA = 1\n      │     ^^^^^^^\n    2 │ const b = undefinedThing + 1\n    3 │ if (b == b) { debugger }\n  \n  i A variable that is never reassigned is clearer as const, because it prevents the binding from being reassigned.\n  \n  i Safe fix: Use const instead.\n  \n    1   │ - let·unusedA·=·1\n      1 │ + const·unusedA·=·1\n    2 2 │   const b = undefinedThing + 1\n    3 3 │   if (b == b) { debugger }\n  \n\nbad.js:1:5 lint/correctness/noUnusedVariables  FIXABLE  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n  ! This variable unusedA is unused.\n  \n  > 1 │ let unusedA = 1\n      │     ^^^^^^^\n    2 │ const b = undefinedThing + 1\n    3 │ if (b == b) { debugger }\n  \n  i Unused variables are often the result of typos, incomplete refactors, or other sources of bugs.\n  \n  i Unsafe fix: If this is intentional, prepend unusedA with an underscore.\n  \n    1   │ - let·unusedA·=·1\n      1 │ + let·_unusedA·=·1\n    2 2 │   const b = undefinedThing + 1\n    3 3 │   if (b == b) { debugger }\n  \n\nbad.js:4:1 lint/style/useConst  FIXABLE  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n  ! This let declares a variable that is only assigned once.\n  \n    2 │ const b = undefinedThing + 1\n    3 │ if (b == b) { debugger }\n  > 4 │ let c = 2\n      │ ^^^\n    5 │ console.log(c)\n    6 │ \n  \n  i 'c' is never reassigned.\n  \n    2 │ const b = undefinedThing + 1\n    3 │ if (b == b) { debugger }\n  > 4 │ let c = 2\n      │     ^\n    5 │ console.log(c)\n    6 │ \n  \n  i A variable that is never reassigned is clearer as const, because it prevents the binding from being reassigned.\n  \n  i Safe fix: Use const instead.\n  \n    2 2 │   const b = undefinedThing + 1\n    3 3 │   if (b == b) { debugger }\n    4   │ - let·c·=·2\n      4 │ + const·c·=·2\n    5 5 │   console.log(c)\n    6 6 │   \n  \n\nbad.js:3:5 lint/suspicious/noSelfCompare ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n  × This comparison uses the same expression on both sides.\n  \n    1 │ let unusedA = 1\n    2 │ const b = undefinedThing + 1\n  > 3 │ if (b == b) { debugger }\n      │     ^^^^^^\n    4 │ let c = 2\n    5 │ console.log(c)\n  \n  i Self-comparisons are usually redundant or a sign that the wrong value is being compared.\n  \n  i Compare two different values instead, or use Number.isNaN() if you are checking for NaN.\n  \n\nbad.js:3:7 lint/suspicious/noDoubleEquals  FIXABLE  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n  × Using == may be unsafe if you are relying on type coercion.\n  \n    1 │ let unusedA = 1\n    2 │ const b = undefinedThing + 1\n  > 3 │ if (b == b) { debugger }\n      │       ^^\n    4 │ let c = 2\n    5 │ console.log(c)\n  \n  i == is only allowed when comparing against null.\n  \n  i Unsafe fix: Use === instead.\n  \n    3 │ if·(b·===·b)·{·debugger·}\n      │         +                \n\nbad.js:3:15 lint/suspicious/noDebugger  FIXABLE  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n  × This is an unexpected use of the debugger statement.\n  \n    1 │ let unusedA = 1\n    2 │ const b = undefinedThing + 1\n  > 3 │ if (b == b) { debugger }\n      │               ^^^^^^^^\n    4 │ let c = 2\n    5 │ console.log(c)\n  \n  i A debugger statement pauses the program when a debugger is open. It is meant for debugging only, and it should not be left in code that is shipped.\n  \n  i Unsafe fix: Remove debugger statement\n  \n    3 │ if·(b·==·b)·{·debugger·}\n      │               --------- \n\nChecked 1 file in 2ms. No fixes applied.\nFound 3 errors.\nFound 3 warnings.\nlint ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n  × Some errors were emitted while running checks.",
    "isError": true
  }
} as const

export const biomePassing = {
  "input": {
    "command": "npx biome lint good.js",
    "description": "Lint good.js with biome",
    "tool": "Bash",
    "tool_use_id": "toolu_014DuX5ACnxGvSoauY77xwCL"
  },
  "result": {
    "ref": 1,
    "result": {
      "stdout": "Checked 1 file in 1587µs. No fixes applied.",
      "stderr": "",
      "interrupted": false,
      "isImage": false,
      "noOutputExpected": false
    },
    "text": "Checked 1 file in 1587µs. No fixes applied."
  }
} as const

export const ruffFailing = {
  "input": {
    "command": "cd /work/runners/pylint && ../venv/bin/ruff check bad.py",
    "description": "Check bad.py with ruff",
    "tool": "Bash",
    "tool_use_id": "toolu_019Kp6uaW6DF6wauGvfYhfzt"
  },
  "result": {
    "ref": 1,
    "result": "Error: Exit code 1\nI001 [*] Import block is un-sorted or un-formatted\n --> bad.py:1:1\n  |\n1 | / import os\n2 | | import sys\n  | |__________^\n3 |   def f():\n4 |       x = 1\n  |\nhelp: Organize imports\n  |\n2 | import sys\n3 +\n4 +\n5 | def f():\n  |\n\nF401 [*] `os` imported but unused\n --> bad.py:1:8\n  |\n1 | import os\n  |        ^^\n2 | import sys\n3 | def f():\n  |\nhelp: Remove unused import: `os`\n  |\n  - import os\n1 | import sys\n  |\n\nF401 [*] `sys` imported but unused\n --> bad.py:2:8\n  |\n1 | import os\n2 | import sys\n  |        ^^^\n3 | def f():\n4 |     x = 1\n  |\nhelp: Remove unused import: `sys`\n  |\n1 | import os\n  - import sys\n2 | def f():\n  |\n\nF841 Local variable `x` is assigned to but never used\n --> bad.py:4:5\n  |\n2 | import sys\n3 | def f():\n4 |     x = 1\n  |     ^\n5 |     return undefined_name\n  |\nhelp: Remove assignment to unused variable `x`\n  |\n3 | def f():\n  -     x = 1\n4 |     return undefined_name\n  |\nnote: This is an unsafe fix and may change runtime behavior\n\nF821 Undefined name `undefined_name`\n --> bad.py:5:12\n  |\n3 | def f():\n4 |     x = 1\n5 |     return undefined_name\n  |            ^^^^^^^^^^^^^^\n\nFound 5 errors.\n[*] 3 fixable with `--fix` (1 unsafe fix available with `--fix --unsafe-fixes`).",
    "text": "Exit code 1\nI001 [*] Import block is un-sorted or un-formatted\n --> bad.py:1:1\n  |\n1 | / import os\n2 | | import sys\n  | |__________^\n3 |   def f():\n4 |       x = 1\n  |\nhelp: Organize imports\n  |\n2 | import sys\n3 +\n4 +\n5 | def f():\n  |\n\nF401 [*] `os` imported but unused\n --> bad.py:1:8\n  |\n1 | import os\n  |        ^^\n2 | import sys\n3 | def f():\n  |\nhelp: Remove unused import: `os`\n  |\n  - import os\n1 | import sys\n  |\n\nF401 [*] `sys` imported but unused\n --> bad.py:2:8\n  |\n1 | import os\n2 | import sys\n  |        ^^^\n3 | def f():\n4 |     x = 1\n  |\nhelp: Remove unused import: `sys`\n  |\n1 | import os\n  - import sys\n2 | def f():\n  |\n\nF841 Local variable `x` is assigned to but never used\n --> bad.py:4:5\n  |\n2 | import sys\n3 | def f():\n4 |     x = 1\n  |     ^\n5 |     return undefined_name\n  |\nhelp: Remove assignment to unused variable `x`\n  |\n3 | def f():\n  -     x = 1\n4 |     return undefined_name\n  |\nnote: This is an unsafe fix and may change runtime behavior\n\nF821 Undefined name `undefined_name`\n --> bad.py:5:12\n  |\n3 | def f():\n4 |     x = 1\n5 |     return undefined_name\n  |            ^^^^^^^^^^^^^^\n\nFound 5 errors.\n[*] 3 fixable with `--fix` (1 unsafe fix available with `--fix --unsafe-fixes`).",
    "isError": true
  }
} as const

export const ruffPassing = {
  "input": {
    "command": "cd /work/runners/pylint && ../venv/bin/ruff check good.py",
    "description": "Check good.py with ruff",
    "tool": "Bash",
    "tool_use_id": "toolu_01UL1Lkf5pH5FuJCrEs5S7JM"
  },
  "result": {
    "ref": 1,
    "result": {
      "stdout": "All checks passed!",
      "stderr": "",
      "interrupted": false,
      "isImage": false,
      "noOutputExpected": false
    },
    "text": "All checks passed!"
  }
} as const

// The output of `npm test` in this repo (`claude plugin test .`, bun-style),
// captured from a terminal run while one test failed, its passing lines cut.
// Not recorded through tool.call: the output of a failing run as the mod
// reads it, after "Exit code 1".
export const CLAUDE_PLUGIN_TEST_FAILING = "\n> test\n> claude plugin test .\n\n(fail) Event translator: which Bash commands are checks > npm test reads the summary of the runner it ran: here, claude plugin test [0.15ms]\n(pass) Event translator: which Bash commands are checks > a check a hook denied is no event [0.10ms]\n\n 225 pass\n 1 fail\nRan 226 tests across 7 files. [0.90s]\n"
