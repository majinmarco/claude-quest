// Bash tool.call inputs and results of git commits, recorded from Claude Code
// 2.1.308 in headless sessions (`claude -p`) with a recording mod, every one a
// real run on a scratch repo (paths rewritten to /work/vault). Each is what a
// tool.call hook sees as `e` and what `next(e)` resolved to.
//
// A commit that succeeds resolves Bash's record with gitOperation.commit
// { sha, kind, branch }: kind "committed" for a new commit (chained after
// `git add`, with -am, under `cd vault &&`), "amended" for --amend. A
// --dry-run resolves the record with no gitOperation; a commit with nothing
// to commit resolves isError, "Exit code 1" and git's message, no record.
// The sha is git's short one, as its summary line prints it.

export const gitStatus = {
  "input": {
    "command": "git status --short",
    "description": "Show short working tree status",
    "tool": "Bash",
    "tool_use_id": "toolu_015vVzSXLvVypE6ZEpepKpKS"
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
    "text": "(Bash completed with no output)",
    "isReadOnly": true
  }
} as const

export const commitAfterAdd = {
  "input": {
    "command": "printf '\\nexport function deposit(vault: Vault, amount: number): Vault {\\n  if (vault.locked) {\\n    throw new Error(\"The vault is locked\")\\n  }\\n  return { ...vault, gold: vault.gold + amount }\\n}\\n' >> src/vault.ts && git add src/vault.ts && git commit -m \"Add deposit to the vault\"",
    "description": "Append deposit function and commit it",
    "tool": "Bash",
    "tool_use_id": "toolu_0194KCGzVRLF7yEA6bitN6Q9"
  },
  "result": {
    "ref": 1,
    "result": {
      "stdout": "[main 7ab19e4] Add deposit to the vault\n 1 file changed, 7 insertions(+)",
      "stderr": "",
      "interrupted": false,
      "isImage": false,
      "noOutputExpected": false,
      "gitOperation": {
        "commit": {
          "sha": "7ab19e4",
          "kind": "committed",
          "branch": "main"
        }
      },
      "bashEditDiff": {
        "files": [
          {
            "filePath": "/work/vault/src/vault.ts",
            "hunks": [
              {
                "oldStart": 3,
                "oldLines": 3,
                "newStart": 3,
                "newLines": 10,
                "lines": [
                  " export function openVault(vault: Vault): Vault {",
                  "   return { ...vault, locked: false }",
                  " }",
                  "+",
                  "+export function deposit(vault: Vault, amount: number): Vault {",
                  "+  if (vault.locked) {",
                  "+    throw new Error(\"The vault is locked\")",
                  "+  }",
                  "+  return { ...vault, gold: vault.gold + amount }",
                  "+}"
                ]
              }
            ]
          }
        ],
        "moreFiles": 0,
        "changedFiles": [
          "/work/vault/src/vault.ts"
        ]
      }
    },
    "text": "[main 7ab19e4] Add deposit to the vault\n 1 file changed, 7 insertions(+)"
  }
} as const

export const commitNothingToCommit = {
  "input": {
    "command": "git commit -m \"Nothing to commit here\"",
    "description": "Attempt a commit with nothing staged",
    "tool": "Bash",
    "tool_use_id": "toolu_01M28ZR2WRt8fktSHiQj5Qoe"
  },
  "result": {
    "ref": 1,
    "result": "Error: Exit code 1\nOn branch main\nnothing to commit, working tree clean",
    "text": "Exit code 1\nOn branch main\nnothing to commit, working tree clean",
    "isError": true
  }
} as const

export const commitAll = {
  "input": {
    "command": "git commit -am \"Add withdraw\"",
    "description": "Commit all tracked changes as withdraw",
    "tool": "Bash",
    "tool_use_id": "toolu_01DwWqRdAV4VShMXLhRqbfNa"
  },
  "result": {
    "ref": 1,
    "result": {
      "stdout": "[main 348c470] Add withdraw\n 1 file changed, 7 insertions(+)",
      "stderr": "",
      "interrupted": false,
      "isImage": false,
      "noOutputExpected": false,
      "gitOperation": {
        "commit": {
          "sha": "348c470",
          "kind": "committed",
          "branch": "main"
        }
      }
    },
    "text": "[main 348c470] Add withdraw\n 1 file changed, 7 insertions(+)"
  }
} as const

export const commitDryRun = {
  "input": {
    "command": "printf '\\nexport const lockVault = (vault: Vault): Vault => ({ ...vault, locked: true })\\n' >> src/vault.ts && git add -A && git commit --dry-run -m \"Lock the vault\"",
    "description": "Append lockVault, stage all, dry-run commit",
    "tool": "Bash",
    "tool_use_id": "toolu_016JhamUjs6qus92FD44kDwE"
  },
  "result": {
    "ref": 1,
    "result": {
      "stdout": "On branch main\nChanges to be committed:\n  (use \"git restore --staged <file>...\" to unstage)\n\tmodified:   src/vault.ts\n\ndiff --git c/src/vault.ts i/src/vault.ts\nindex 57bc84b..42a0c7c 100644\n--- c/src/vault.ts\n+++ i/src/vault.ts\n@@ -17,3 +17,5 @@ export function withdraw(vault: Vault, amount: number): Vault {\n   }\n   return { ...vault, gold: vault.gold - amount }\n }\n+\n+export const lockVault = (vault: Vault): Vault => ({ ...vault, locked: true })",
      "stderr": "",
      "interrupted": false,
      "isImage": false,
      "noOutputExpected": false,
      "bashEditDiff": {
        "files": [
          {
            "filePath": "/work/vault/src/vault.ts",
            "hunks": [
              {
                "oldStart": 17,
                "oldLines": 3,
                "newStart": 17,
                "newLines": 5,
                "lines": [
                  "   }",
                  "   return { ...vault, gold: vault.gold - amount }",
                  " }",
                  "+",
                  "+export const lockVault = (vault: Vault): Vault => ({ ...vault, locked: true })"
                ]
              }
            ]
          }
        ],
        "moreFiles": 0,
        "changedFiles": [
          "/work/vault/src/vault.ts"
        ]
      }
    },
    "text": "On branch main\nChanges to be committed:\n  (use \"git restore --staged <file>...\" to unstage)\n\tmodified:   src/vault.ts\n\ndiff --git c/src/vault.ts i/src/vault.ts\nindex 57bc84b..42a0c7c 100644\n--- c/src/vault.ts\n+++ i/src/vault.ts\n@@ -17,3 +17,5 @@ export function withdraw(vault: Vault, amount: number): Vault {\n   }\n   return { ...vault, gold: vault.gold - amount }\n }\n+\n+export const lockVault = (vault: Vault): Vault => ({ ...vault, locked: true })"
  }
} as const

export const commitPlain = {
  "input": {
    "command": "git commit -m \"Lock the vault\"",
    "description": "Commit staged lockVault change",
    "tool": "Bash",
    "tool_use_id": "toolu_01S6mY13u88ELMBCp43fYDkF"
  },
  "result": {
    "ref": 1,
    "result": {
      "stdout": "[main 691eb59] Lock the vault\n 1 file changed, 2 insertions(+)",
      "stderr": "",
      "interrupted": false,
      "isImage": false,
      "noOutputExpected": false,
      "gitOperation": {
        "commit": {
          "sha": "691eb59",
          "kind": "committed",
          "branch": "main"
        }
      }
    },
    "text": "[main 691eb59] Lock the vault\n 1 file changed, 2 insertions(+)"
  }
} as const

export const commitAmend = {
  "input": {
    "command": "git commit --amend --no-edit",
    "description": "Amend last commit without changing message",
    "tool": "Bash",
    "tool_use_id": "toolu_016AvUU71uQ8eCpC8o9a5HSL"
  },
  "result": {
    "ref": 1,
    "result": {
      "stdout": "[main 42ce36d] Lock the vault\n Date: Fri Oct 23 20:47:12 2026 -0400\n 1 file changed, 2 insertions(+)",
      "stderr": "",
      "interrupted": false,
      "isImage": false,
      "noOutputExpected": false,
      "gitOperation": {
        "commit": {
          "sha": "42ce36d",
          "kind": "amended",
          "branch": "main"
        }
      }
    },
    "text": "[main 42ce36d] Lock the vault\n Date: Fri Oct 23 20:47:12 2026 -0400\n 1 file changed, 2 insertions(+)"
  }
} as const

export const commitInFolder = {
  "input": {
    "command": "cd vault && git add -A && git commit -m \"Tell an empty vault\"",
    "description": "Stage all changes and commit",
    "tool": "Bash",
    "tool_use_id": "toolu_01CCfvK6mPt4upNnAHzdC2cR"
  },
  "result": {
    "ref": 1,
    "result": {
      "stdout": "[main 7db2a90] Tell an empty vault\n 1 file changed, 2 insertions(+)",
      "stderr": "",
      "interrupted": false,
      "isImage": false,
      "noOutputExpected": false,
      "gitOperation": {
        "commit": {
          "sha": "7db2a90",
          "kind": "committed",
          "branch": "main"
        }
      }
    },
    "text": "[main 7db2a90] Tell an empty vault\n 1 file changed, 2 insertions(+)"
  }
} as const

// What `git show --format= --no-color --no-ext-diff <sha>` printed for the
// commits above, captured from a terminal in the same scratch repo (git
// 2.51): not recorded through tool.call, the output the mod reads through
// $.process.run after a commit.

/** commitAfterAdd's commit, 7ab19e4: deposit added to src/vault.ts. */
export const GIT_SHOW_DEPOSIT = "diff --git a/src/vault.ts b/src/vault.ts\nindex 9a501b0..0fa61c2 100644\n--- a/src/vault.ts\n+++ b/src/vault.ts\n@@ -3,3 +3,10 @@ export type Vault = { gold: number; locked: boolean }\n export function openVault(vault: Vault): Vault {\n   return { ...vault, locked: false }\n }\n+\n+export function deposit(vault: Vault, amount: number): Vault {\n+  if (vault.locked) {\n+    throw new Error(\"The vault is locked\")\n+  }\n+  return { ...vault, gold: vault.gold + amount }\n+}\n"

/** A later commit: a binary file and a text file created. */
export const GIT_SHOW_NEW_FILES = "diff --git a/coin.png b/coin.png\nnew file mode 100644\nindex 0000000..d0463d4\nBinary files /dev/null and b/coin.png differ\ndiff --git a/src/limits.ts b/src/limits.ts\nnew file mode 100644\nindex 0000000..33d257f\n--- /dev/null\n+++ b/src/limits.ts\n@@ -0,0 +1 @@\n+export const LIMIT = 1000\n"

/** A later commit: a binary file deleted, a file created, one line added to another. */
export const GIT_SHOW_MIXED = "diff --git a/coin.png b/coin.png\ndeleted file mode 100644\nindex d0463d4..0000000\nBinary files a/coin.png and /dev/null differ\ndiff --git a/old.txt b/old.txt\nnew file mode 100644\nindex 0000000..286c5f5\n--- /dev/null\n+++ b/old.txt\n@@ -0,0 +1 @@\n+gone\ndiff --git a/src/vault.ts b/src/vault.ts\nindex 3bbf4ef..7ab0600 100644\n--- a/src/vault.ts\n+++ b/src/vault.ts\n@@ -1,3 +1,4 @@\n+import { LIMIT } from \"./limits\"\n export type Vault = { gold: number; locked: boolean }\n \n export function openVault(vault: Vault): Vault {\n"

/** A later commit: a text file deleted. */
export const GIT_SHOW_DELETED = "diff --git a/old.txt b/old.txt\ndeleted file mode 100644\nindex 286c5f5..0000000\n--- a/old.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-gone\n"

// Derived, not captured: the Bash calls below were not recorded. They are
// built from the recorded format above (a failed Bash call is an error whose
// result is "Error: " and whose text is "Exit code N", then the command's
// output; git's summary line `[branch sha] subject` as commitAfterAdd printed
// it), for a commit chained before a command that then failed. A failed call
// hands no record, so no gitOperation: the sha is only in the text.

/** `git commit && npm test`, the commit made, the tests failing after it. */
export const commitThenFailingTests = {
  "input": {
    "command": "git add -A && git commit -m \"Add withdraw limit\" && npm test",
    "description": "Commit the withdraw limit and run the tests",
    "tool": "Bash",
    "tool_use_id": "toolu_derived_commit_then_failing_tests"
  },
  "result": {
    "ref": 1,
    "result": "Error: Exit code 1\n[main 4c1d2e9] Add withdraw limit\n 1 file changed, 3 insertions(+)\n\n> vault@1.0.0 test\n> vitest run\n\n FAIL  src/vault.test.ts > withdraw > refuses past the limit\n\n Test Files  1 failed (1)\n      Tests  1 failed | 4 passed (5)",
    "text": "Exit code 1\n[main 4c1d2e9] Add withdraw limit\n 1 file changed, 3 insertions(+)\n\n> vault@1.0.0 test\n> vitest run\n\n FAIL  src/vault.test.ts > withdraw > refuses past the limit\n\n Test Files  1 failed (1)\n      Tests  1 failed | 4 passed (5)",
    "isError": true
  }
} as const

/** The same, the first commit of a repository: git prints `(root-commit)`, under `cd vault &&`. */
export const rootCommitThenFailingTests = {
  "input": {
    "command": "cd vault && git commit -m \"Start the vault\" && npm test",
    "description": "Commit and run the tests",
    "tool": "Bash",
    "tool_use_id": "toolu_derived_root_commit_then_failing_tests"
  },
  "result": {
    "ref": 1,
    "result": "Error: Exit code 1\n[main (root-commit) 0a1b2c3] Start the vault\n 2 files changed, 12 insertions(+)\nnpm error Missing script: \"test\"",
    "text": "Exit code 1\n[main (root-commit) 0a1b2c3] Start the vault\n 2 files changed, 12 insertions(+)\nnpm error Missing script: \"test\"",
    "isError": true
  }
} as const

/** `git commit --amend && npm test`, the tests failing: an amend, no new commit. */
export const amendThenFailingTests = {
  "input": {
    "command": "git commit --amend --no-edit && npm test",
    "description": "Amend and run the tests",
    "tool": "Bash",
    "tool_use_id": "toolu_derived_amend_then_failing_tests"
  },
  "result": {
    "ref": 1,
    "result": "Error: Exit code 1\n[main 9f8e7d6] Add withdraw limit\n Date: Fri Oct 23 20:47:12 2026 -0400\n 1 file changed, 3 insertions(+)\n\n Test Files  1 failed (1)",
    "text": "Exit code 1\n[main 9f8e7d6] Add withdraw limit\n Date: Fri Oct 23 20:47:12 2026 -0400\n 1 file changed, 3 insertions(+)\n\n Test Files  1 failed (1)",
    "isError": true
  }
} as const
