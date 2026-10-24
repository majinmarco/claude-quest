// Write, Edit and NotebookEdit tool.call inputs and results recorded from
// Claude Code 2.1.308 in a headless session (`claude -p`) with a recording mod,
// every one a real call on a scratch project (paths rewritten to /work/forge).
// Each is what a tool.call hook sees as `e` and what `next(e)` resolved to.
//
// A Write resolves its record, { type: "create" | "update", filePath, content,
// structuredPatch, originalFile, userModified }: a new file has type "create",
// originalFile null and an empty structuredPatch. An Edit resolves { filePath,
// oldString, newString, originalFile, structuredPatch, userModified,
// replaceAll }. A patch's lines carry context (" ") beside the lines removed
// ("-") and added ("+"). No gitDiff came with these (the project had no
// GitHub remote). An Edit that fails resolves isError, its result a string.
// A NotebookEdit resolves { new_source, old_source, cell_type, edit_mode,
// cell_id, notebook_path, original_file, updated_file }, with no patch.

export const writeNewFile = {
  "input": {
    "file_path": "/work/forge/src/user-profile-card.tsx",
    "content": "export type UserProfile = {\n  id: string;\n  name: string;\n  email: string;\n  joinedAt: Date;\n};\n\nexport function formatName(profile: UserProfile): string {\n  return profile.name\n    .trim()\n    .split(/\\s+/)\n    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())\n    .join(' ');\n}\n\nexport function formatEmail(profile: UserProfile): string {\n  return profile.email.trim().toLowerCase();\n}\n\nexport function describeProfile(profile: UserProfile): string {\n  const joined = profile.joinedAt.toISOString().slice(0, 10);\n  return `${formatName(profile)} <${formatEmail(profile)}> (joined ${joined})`;\n}\n",
    "tool": "Write",
    "tool_use_id": "toolu_01FSS7Jw1xPN1ngfLeb7NmoZ"
  },
  "result": {
    "ref": 1,
    "result": {
      "type": "create",
      "filePath": "/work/forge/src/user-profile-card.tsx",
      "content": "export type UserProfile = {\n  id: string;\n  name: string;\n  email: string;\n  joinedAt: Date;\n};\n\nexport function formatName(profile: UserProfile): string {\n  return profile.name\n    .trim()\n    .split(/\\s+/)\n    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())\n    .join(' ');\n}\n\nexport function formatEmail(profile: UserProfile): string {\n  return profile.email.trim().toLowerCase();\n}\n\nexport function describeProfile(profile: UserProfile): string {\n  const joined = profile.joinedAt.toISOString().slice(0, 10);\n  return `${formatName(profile)} <${formatEmail(profile)}> (joined ${joined})`;\n}\n",
      "structuredPatch": [],
      "originalFile": null,
      "userModified": false
    },
    "text": "File created successfully at: /work/forge/src/user-profile-card.tsx (file state is current in your context — no need to Read it back)"
  }
} as const

export const editOneLine = {
  "input": {
    "replace_all": false,
    "file_path": "/work/forge/src/greeting.ts",
    "old_string": "`Hello, ${name}`",
    "new_string": "`Hi, ${name}`",
    "tool": "Edit",
    "tool_use_id": "toolu_01BUvk82gsb4QRNuZRKAFnEf"
  },
  "result": {
    "ref": 1,
    "result": {
      "filePath": "/work/forge/src/greeting.ts",
      "oldString": "`Hello, ${name}`",
      "newString": "`Hi, ${name}`",
      "originalFile": "export const greet = (name: string): string => `Hello, ${name}`\n\nexport const farewell = (name: string): string => `Bye, ${name}`\n",
      "structuredPatch": [
        {
          "oldStart": 1,
          "oldLines": 3,
          "newStart": 1,
          "newLines": 3,
          "lines": [
            "-export const greet = (name: string): string => `Hello, ${name}`",
            "+export const greet = (name: string): string => `Hi, ${name}`",
            " ",
            " export const farewell = (name: string): string => `Bye, ${name}`"
          ]
        }
      ],
      "userModified": false,
      "replaceAll": false
    },
    "text": "The file /work/forge/src/greeting.ts has been updated successfully. (file state is current in your context — no need to Read it back)"
  }
} as const

export const editTwelveLines = {
  "input": {
    "replace_all": false,
    "file_path": "/work/forge/src/order-ledger.ts",
    "old_string": "export const line5 = (x: number): number => x * 5 + 5\nexport const line6 = (x: number): number => x * 6 + 6\nexport const line7 = (x: number): number => x * 7 + 7\nexport const line8 = (x: number): number => x * 8 + 8\nexport const line9 = (x: number): number => x * 9 + 9\nexport const line10 = (x: number): number => x * 10 + 10\nexport const line11 = (x: number): number => x * 11 + 11\nexport const line12 = (x: number): number => x * 12 + 12\nexport const line13 = (x: number): number => x * 13 + 13\nexport const line14 = (x: number): number => x * 14 + 14",
    "new_string": "export const taxed5 = (x: number): number => x * 1.2 + 5\nexport const taxed6 = (x: number): number => x * 1.2 + 6\nexport const taxed7 = (x: number): number => x * 1.2 + 7\nexport const taxed8 = (x: number): number => x * 1.2 + 8\nexport const taxed9 = (x: number): number => x * 1.2 + 9\nexport const taxed10 = (x: number): number => x * 1.2 + 10\nexport const taxed11 = (x: number): number => x * 1.2 + 11\nexport const taxed12 = (x: number): number => x * 1.2 + 12\nexport const taxed13 = (x: number): number => x * 1.2 + 13\nexport const taxed14 = (x: number): number => x * 1.2 + 14\nexport const taxed15 = (x: number): number => x * 1.2 + 15\nexport const taxed16 = (x: number): number => x * 1.2 + 16",
    "tool": "Edit",
    "tool_use_id": "toolu_016Am7FRFnVyfpszjKJEWjKy"
  },
  "result": {
    "ref": 1,
    "result": {
      "filePath": "/work/forge/src/order-ledger.ts",
      "oldString": "export const line5 = (x: number): number => x * 5 + 5\nexport const line6 = (x: number): number => x * 6 + 6\nexport const line7 = (x: number): number => x * 7 + 7\nexport const line8 = (x: number): number => x * 8 + 8\nexport const line9 = (x: number): number => x * 9 + 9\nexport const line10 = (x: number): number => x * 10 + 10\nexport const line11 = (x: number): number => x * 11 + 11\nexport const line12 = (x: number): number => x * 12 + 12\nexport const line13 = (x: number): number => x * 13 + 13\nexport const line14 = (x: number): number => x * 14 + 14",
      "newString": "export const taxed5 = (x: number): number => x * 1.2 + 5\nexport const taxed6 = (x: number): number => x * 1.2 + 6\nexport const taxed7 = (x: number): number => x * 1.2 + 7\nexport const taxed8 = (x: number): number => x * 1.2 + 8\nexport const taxed9 = (x: number): number => x * 1.2 + 9\nexport const taxed10 = (x: number): number => x * 1.2 + 10\nexport const taxed11 = (x: number): number => x * 1.2 + 11\nexport const taxed12 = (x: number): number => x * 1.2 + 12\nexport const taxed13 = (x: number): number => x * 1.2 + 13\nexport const taxed14 = (x: number): number => x * 1.2 + 14\nexport const taxed15 = (x: number): number => x * 1.2 + 15\nexport const taxed16 = (x: number): number => x * 1.2 + 16",
      "originalFile": "// The order ledger: totals and taxes for an order.\n\nexport const line1 = (x: number): number => x * 1 + 1\nexport const line2 = (x: number): number => x * 2 + 2\nexport const line3 = (x: number): number => x * 3 + 3\nexport const line4 = (x: number): number => x * 4 + 4\nexport const line5 = (x: number): number => x * 5 + 5\nexport const line6 = (x: number): number => x * 6 + 6\nexport const line7 = (x: number): number => x * 7 + 7\nexport const line8 = (x: number): number => x * 8 + 8\nexport const line9 = (x: number): number => x * 9 + 9\nexport const line10 = (x: number): number => x * 10 + 10\nexport const line11 = (x: number): number => x * 11 + 11\nexport const line12 = (x: number): number => x * 12 + 12\nexport const line13 = (x: number): number => x * 13 + 13\nexport const line14 = (x: number): number => x * 14 + 14\nexport const line15 = (x: number): number => x * 15 + 15\nexport const line16 = (x: number): number => x * 16 + 16\nexport const line17 = (x: number): number => x * 17 + 17\nexport const line18 = (x: number): number => x * 18 + 18\nexport const line19 = (x: number): number => x * 19 + 19\nexport const line20 = (x: number): number => x * 20 + 20\nexport const line21 = (x: number): number => x * 21 + 21\nexport const line22 = (x: number): number => x * 22 + 22\nexport const line23 = (x: number): number => x * 23 + 23\nexport const line24 = (x: number): number => x * 24 + 24\nexport const line25 = (x: number): number => x * 25 + 25\nexport const line26 = (x: number): number => x * 26 + 26\nexport const line27 = (x: number): number => x * 27 + 27\nexport const line28 = (x: number): number => x * 28 + 28\nexport const line29 = (x: number): number => x * 29 + 29\nexport const line30 = (x: number): number => x * 30 + 30\n",
      "structuredPatch": [
        {
          "oldStart": 4,
          "oldLines": 16,
          "newStart": 4,
          "newLines": 18,
          "lines": [
            " export const line2 = (x: number): number => x * 2 + 2",
            " export const line3 = (x: number): number => x * 3 + 3",
            " export const line4 = (x: number): number => x * 4 + 4",
            "-export const line5 = (x: number): number => x * 5 + 5",
            "-export const line6 = (x: number): number => x * 6 + 6",
            "-export const line7 = (x: number): number => x * 7 + 7",
            "-export const line8 = (x: number): number => x * 8 + 8",
            "-export const line9 = (x: number): number => x * 9 + 9",
            "-export const line10 = (x: number): number => x * 10 + 10",
            "-export const line11 = (x: number): number => x * 11 + 11",
            "-export const line12 = (x: number): number => x * 12 + 12",
            "-export const line13 = (x: number): number => x * 13 + 13",
            "-export const line14 = (x: number): number => x * 14 + 14",
            "+export const taxed5 = (x: number): number => x * 1.2 + 5",
            "+export const taxed6 = (x: number): number => x * 1.2 + 6",
            "+export const taxed7 = (x: number): number => x * 1.2 + 7",
            "+export const taxed8 = (x: number): number => x * 1.2 + 8",
            "+export const taxed9 = (x: number): number => x * 1.2 + 9",
            "+export const taxed10 = (x: number): number => x * 1.2 + 10",
            "+export const taxed11 = (x: number): number => x * 1.2 + 11",
            "+export const taxed12 = (x: number): number => x * 1.2 + 12",
            "+export const taxed13 = (x: number): number => x * 1.2 + 13",
            "+export const taxed14 = (x: number): number => x * 1.2 + 14",
            "+export const taxed15 = (x: number): number => x * 1.2 + 15",
            "+export const taxed16 = (x: number): number => x * 1.2 + 16",
            " export const line15 = (x: number): number => x * 15 + 15",
            " export const line16 = (x: number): number => x * 16 + 16",
            " export const line17 = (x: number): number => x * 17 + 17"
          ]
        }
      ],
      "userModified": false,
      "replaceAll": false
    },
    "text": "The file /work/forge/src/order-ledger.ts has been updated successfully. (file state is current in your context — no need to Read it back)"
  }
} as const

export const editReplaceAll = {
  "input": {
    "replace_all": true,
    "file_path": "/work/forge/src/order-ledger.ts",
    "old_string": "x: number",
    "new_string": "amount: number",
    "tool": "Edit",
    "tool_use_id": "toolu_01ChYkqZWQnAAEtMknXW77ff"
  },
  "result": {
    "ref": 1,
    "result": {
      "filePath": "/work/forge/src/order-ledger.ts",
      "oldString": "x: number",
      "newString": "amount: number",
      "originalFile": "// The order ledger: totals and taxes for an order.\n\nexport const line1 = (x: number): number => x * 1 + 1\nexport const line2 = (x: number): number => x * 2 + 2\nexport const line3 = (x: number): number => x * 3 + 3\nexport const line4 = (x: number): number => x * 4 + 4\nexport const taxed5 = (x: number): number => x * 1.2 + 5\nexport const taxed6 = (x: number): number => x * 1.2 + 6\nexport const taxed7 = (x: number): number => x * 1.2 + 7\nexport const taxed8 = (x: number): number => x * 1.2 + 8\nexport const taxed9 = (x: number): number => x * 1.2 + 9\nexport const taxed10 = (x: number): number => x * 1.2 + 10\nexport const taxed11 = (x: number): number => x * 1.2 + 11\nexport const taxed12 = (x: number): number => x * 1.2 + 12\nexport const taxed13 = (x: number): number => x * 1.2 + 13\nexport const taxed14 = (x: number): number => x * 1.2 + 14\nexport const taxed15 = (x: number): number => x * 1.2 + 15\nexport const taxed16 = (x: number): number => x * 1.2 + 16\nexport const line15 = (x: number): number => x * 15 + 15\nexport const line16 = (x: number): number => x * 16 + 16\nexport const line17 = (x: number): number => x * 17 + 17\nexport const line18 = (x: number): number => x * 18 + 18\nexport const line19 = (x: number): number => x * 19 + 19\nexport const line20 = (x: number): number => x * 20 + 20\nexport const line21 = (x: number): number => x * 21 + 21\nexport const line22 = (x: number): number => x * 22 + 22\nexport const line23 = (x: number): number => x * 23 + 23\nexport const line24 = (x: number): number => x * 24 + 24\nexport const line25 = (x: number): number => x * 25 + 25\nexport const line26 = (x: number): number => x * 26 + 26\nexport const line27 = (x: number): number => x * 27 + 27\nexport const line28 = (x: number): number => x * 28 + 28\nexport const line29 = (x: number): number => x * 29 + 29\nexport const line30 = (x: number): number => x * 30 + 30\n",
      "structuredPatch": [
        {
          "oldStart": 1,
          "oldLines": 34,
          "newStart": 1,
          "newLines": 34,
          "lines": [
            " // The order ledger: totals and taxes for an order.",
            " ",
            "-export const line1 = (x: number): number => x * 1 + 1",
            "-export const line2 = (x: number): number => x * 2 + 2",
            "-export const line3 = (x: number): number => x * 3 + 3",
            "-export const line4 = (x: number): number => x * 4 + 4",
            "-export const taxed5 = (x: number): number => x * 1.2 + 5",
            "-export const taxed6 = (x: number): number => x * 1.2 + 6",
            "-export const taxed7 = (x: number): number => x * 1.2 + 7",
            "-export const taxed8 = (x: number): number => x * 1.2 + 8",
            "-export const taxed9 = (x: number): number => x * 1.2 + 9",
            "-export const taxed10 = (x: number): number => x * 1.2 + 10",
            "-export const taxed11 = (x: number): number => x * 1.2 + 11",
            "-export const taxed12 = (x: number): number => x * 1.2 + 12",
            "-export const taxed13 = (x: number): number => x * 1.2 + 13",
            "-export const taxed14 = (x: number): number => x * 1.2 + 14",
            "-export const taxed15 = (x: number): number => x * 1.2 + 15",
            "-export const taxed16 = (x: number): number => x * 1.2 + 16",
            "-export const line15 = (x: number): number => x * 15 + 15",
            "-export const line16 = (x: number): number => x * 16 + 16",
            "-export const line17 = (x: number): number => x * 17 + 17",
            "-export const line18 = (x: number): number => x * 18 + 18",
            "-export const line19 = (x: number): number => x * 19 + 19",
            "-export const line20 = (x: number): number => x * 20 + 20",
            "-export const line21 = (x: number): number => x * 21 + 21",
            "-export const line22 = (x: number): number => x * 22 + 22",
            "-export const line23 = (x: number): number => x * 23 + 23",
            "-export const line24 = (x: number): number => x * 24 + 24",
            "-export const line25 = (x: number): number => x * 25 + 25",
            "-export const line26 = (x: number): number => x * 26 + 26",
            "-export const line27 = (x: number): number => x * 27 + 27",
            "-export const line28 = (x: number): number => x * 28 + 28",
            "-export const line29 = (x: number): number => x * 29 + 29",
            "-export const line30 = (x: number): number => x * 30 + 30",
            "+export const line1 = (amount: number): number => x * 1 + 1",
            "+export const line2 = (amount: number): number => x * 2 + 2",
            "+export const line3 = (amount: number): number => x * 3 + 3",
            "+export const line4 = (amount: number): number => x * 4 + 4",
            "+export const taxed5 = (amount: number): number => x * 1.2 + 5",
            "+export const taxed6 = (amount: number): number => x * 1.2 + 6",
            "+export const taxed7 = (amount: number): number => x * 1.2 + 7",
            "+export const taxed8 = (amount: number): number => x * 1.2 + 8",
            "+export const taxed9 = (amount: number): number => x * 1.2 + 9",
            "+export const taxed10 = (amount: number): number => x * 1.2 + 10",
            "+export const taxed11 = (amount: number): number => x * 1.2 + 11",
            "+export const taxed12 = (amount: number): number => x * 1.2 + 12",
            "+export const taxed13 = (amount: number): number => x * 1.2 + 13",
            "+export const taxed14 = (amount: number): number => x * 1.2 + 14",
            "+export const taxed15 = (amount: number): number => x * 1.2 + 15",
            "+export const taxed16 = (amount: number): number => x * 1.2 + 16",
            "+export const line15 = (amount: number): number => x * 15 + 15",
            "+export const line16 = (amount: number): number => x * 16 + 16",
            "+export const line17 = (amount: number): number => x * 17 + 17",
            "+export const line18 = (amount: number): number => x * 18 + 18",
            "+export const line19 = (amount: number): number => x * 19 + 19",
            "+export const line20 = (amount: number): number => x * 20 + 20",
            "+export const line21 = (amount: number): number => x * 21 + 21",
            "+export const line22 = (amount: number): number => x * 22 + 22",
            "+export const line23 = (amount: number): number => x * 23 + 23",
            "+export const line24 = (amount: number): number => x * 24 + 24",
            "+export const line25 = (amount: number): number => x * 25 + 25",
            "+export const line26 = (amount: number): number => x * 26 + 26",
            "+export const line27 = (amount: number): number => x * 27 + 27",
            "+export const line28 = (amount: number): number => x * 28 + 28",
            "+export const line29 = (amount: number): number => x * 29 + 29",
            "+export const line30 = (amount: number): number => x * 30 + 30"
          ]
        }
      ],
      "userModified": false,
      "replaceAll": true
    },
    "text": "The file /work/forge/src/order-ledger.ts has been updated. All occurrences were successfully replaced. (file state is current in your context — no need to Read it back)"
  }
} as const

export const writeRewrite = {
  "input": {
    "file_path": "/work/forge/src/config.ts",
    "content": "export function loadConfig(env: Record<string, string>) {\n  const retries = Number(env.RETRIES ?? '3');\n  const timeoutMs = Number(env.TIMEOUT_MS ?? '1000');\n  const verbose = env.VERBOSE === 'true';\n\n  if (!Number.isInteger(retries) || retries < 0) {\n    throw new Error(`Invalid RETRIES: ${env.RETRIES}`);\n  }\n  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {\n    throw new Error(`Invalid TIMEOUT_MS: ${env.TIMEOUT_MS}`);\n  }\n\n  return { retries, timeoutMs, verbose };\n}\n",
    "tool": "Write",
    "tool_use_id": "toolu_014xxnZxArSsrxrdZDfqbobz"
  },
  "result": {
    "ref": 1,
    "result": {
      "type": "update",
      "filePath": "/work/forge/src/config.ts",
      "content": "export function loadConfig(env: Record<string, string>) {\n  const retries = Number(env.RETRIES ?? '3');\n  const timeoutMs = Number(env.TIMEOUT_MS ?? '1000');\n  const verbose = env.VERBOSE === 'true';\n\n  if (!Number.isInteger(retries) || retries < 0) {\n    throw new Error(`Invalid RETRIES: ${env.RETRIES}`);\n  }\n  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {\n    throw new Error(`Invalid TIMEOUT_MS: ${env.TIMEOUT_MS}`);\n  }\n\n  return { retries, timeoutMs, verbose };\n}\n",
      "structuredPatch": [
        {
          "oldStart": 1,
          "oldLines": 5,
          "newStart": 1,
          "newLines": 14,
          "lines": [
            "-export const config = {",
            "-  retries: 3,",
            "-  timeoutMs: 1000,",
            "-  verbose: false,",
            "+export function loadConfig(env: Record<string, string>) {",
            "+  const retries = Number(env.RETRIES ?? '3');",
            "+  const timeoutMs = Number(env.TIMEOUT_MS ?? '1000');",
            "+  const verbose = env.VERBOSE === 'true';",
            "+",
            "+  if (!Number.isInteger(retries) || retries < 0) {",
            "+    throw new Error(`Invalid RETRIES: ${env.RETRIES}`);",
            "+  }",
            "+  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {",
            "+    throw new Error(`Invalid TIMEOUT_MS: ${env.TIMEOUT_MS}`);",
            "+  }",
            "+",
            "+  return { retries, timeoutMs, verbose };",
            " }"
          ]
        }
      ],
      "originalFile": "export const config = {\n  retries: 3,\n  timeoutMs: 1000,\n  verbose: false,\n}\n",
      "userModified": false
    },
    "text": "The file /work/forge/src/config.ts has been updated successfully. (file state is current in your context — no need to Read it back)"
  }
} as const

export const writeOneLineChanged = {
  "input": {
    "file_path": "/work/forge/src/greeting.ts",
    "content": "export const greet = (name: string): string => `Hi, ${name}`\n\nexport const farewell = (name: string): string => `Goodbye, ${name}`\n",
    "tool": "Write",
    "tool_use_id": "toolu_01JL3cKtbjAtoG5Ge82U2z4V"
  },
  "result": {
    "ref": 1,
    "result": {
      "type": "update",
      "filePath": "/work/forge/src/greeting.ts",
      "content": "export const greet = (name: string): string => `Hi, ${name}`\n\nexport const farewell = (name: string): string => `Goodbye, ${name}`\n",
      "structuredPatch": [
        {
          "oldStart": 1,
          "oldLines": 3,
          "newStart": 1,
          "newLines": 3,
          "lines": [
            " export const greet = (name: string): string => `Hi, ${name}`",
            " ",
            "-export const farewell = (name: string): string => `Bye, ${name}`",
            "+export const farewell = (name: string): string => `Goodbye, ${name}`"
          ]
        }
      ],
      "originalFile": "export const greet = (name: string): string => `Hi, ${name}`\n\nexport const farewell = (name: string): string => `Bye, ${name}`\n",
      "userModified": false
    },
    "text": "The file /work/forge/src/greeting.ts has been updated successfully. (file state is current in your context — no need to Read it back)"
  }
} as const

export const editNotFound = {
  "input": {
    "replace_all": false,
    "file_path": "/work/forge/src/greeting.ts",
    "old_string": "THIS TEXT IS NOT IN THE FILE",
    "new_string": "x",
    "tool": "Edit",
    "tool_use_id": "toolu_019wVL9dFnYcEzy9DiAU46hw"
  },
  "result": {
    "ref": 1,
    "result": "Error: String to replace not found in file.\nString: THIS TEXT IS NOT IN THE FILE",
    "text": "<tool_use_error>String to replace not found in file.\nString: THIS TEXT IS NOT IN THE FILE</tool_use_error>",
    "isError": true
  }
} as const

export const notebookReplace = {
  "input": {
    "notebook_path": "/work/forge/analysis.ipynb",
    "cell_id": "c1",
    "new_source": "y = 2\nprint(y * 3)",
    "tool": "NotebookEdit",
    "tool_use_id": "toolu_01M8yy9W9bNGCFPUdteTnqN8"
  },
  "result": {
    "ref": 1,
    "result": {
      "new_source": "y = 2\nprint(y * 3)",
      "old_source": "x = 1\nprint(x)",
      "cell_type": "code",
      "language": "python",
      "edit_mode": "replace",
      "cell_id": "c1",
      "error": "",
      "notebook_path": "/work/forge/analysis.ipynb",
      "original_file": "{\n \"cells\": [\n  {\n   \"cell_type\": \"code\",\n   \"id\": \"c1\",\n   \"metadata\": {},\n   \"execution_count\": null,\n   \"outputs\": [],\n   \"source\": [\n    \"x = 1\\n\",\n    \"print(x)\"\n   ]\n  }\n ],\n \"metadata\": {\n  \"language_info\": {\n   \"name\": \"python\"\n  }\n },\n \"nbformat\": 4,\n \"nbformat_minor\": 5\n}",
      "updated_file": "{\n \"cells\": [\n  {\n   \"cell_type\": \"code\",\n   \"id\": \"c1\",\n   \"metadata\": {},\n   \"execution_count\": null,\n   \"outputs\": [],\n   \"source\": \"y = 2\\nprint(y * 3)\"\n  }\n ],\n \"metadata\": {\n  \"language_info\": {\n   \"name\": \"python\"\n  }\n },\n \"nbformat\": 4,\n \"nbformat_minor\": 5\n}"
    },
    "text": "Updated cell c1 with y = 2\nprint(y * 3)"
  }
} as const

export const notebookInsert = {
  "input": {
    "notebook_path": "/work/forge/analysis.ipynb",
    "cell_id": "c1",
    "edit_mode": "insert",
    "cell_type": "markdown",
    "new_source": "# Results",
    "tool": "NotebookEdit",
    "tool_use_id": "toolu_01BBAfWetg8VA157w6AqWj5n"
  },
  "result": {
    "ref": 1,
    "result": {
      "new_source": "# Results",
      "cell_type": "markdown",
      "language": "python",
      "edit_mode": "insert",
      "cell_id": "0a3cf2cc",
      "error": "",
      "notebook_path": "/work/forge/analysis.ipynb",
      "original_file": "{\n \"cells\": [\n  {\n   \"cell_type\": \"code\",\n   \"id\": \"c1\",\n   \"metadata\": {},\n   \"execution_count\": null,\n   \"outputs\": [],\n   \"source\": \"y = 2\\nprint(y * 3)\"\n  }\n ],\n \"metadata\": {\n  \"language_info\": {\n   \"name\": \"python\"\n  }\n },\n \"nbformat\": 4,\n \"nbformat_minor\": 5\n}",
      "updated_file": "{\n \"cells\": [\n  {\n   \"cell_type\": \"code\",\n   \"id\": \"c1\",\n   \"metadata\": {},\n   \"execution_count\": null,\n   \"outputs\": [],\n   \"source\": \"y = 2\\nprint(y * 3)\"\n  },\n  {\n   \"cell_type\": \"markdown\",\n   \"id\": \"0a3cf2cc\",\n   \"source\": \"# Results\",\n   \"metadata\": {}\n  }\n ],\n \"metadata\": {\n  \"language_info\": {\n   \"name\": \"python\"\n  }\n },\n \"nbformat\": 4,\n \"nbformat_minor\": 5\n}"
    },
    "text": "Inserted cell 0a3cf2cc with # Results"
  }
} as const
