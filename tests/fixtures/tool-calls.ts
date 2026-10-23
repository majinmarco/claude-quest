// tool.call inputs and results recorded from Claude Code 2.1.308 (paths
// rewritten, file contents cut short). Each is what a tool.call hook sees as
// `e` and what `next(e)` resolved to.

export const read = {
  "input": {
    "file_path": "/work/claude-quest/GLOSSARY.md",
    "tool": "Read",
    "tool_use_id": "toolu_01JtFZXkDThrHHqexmpdWbcX"
  },
  "result": {
    "ref": 1,
    "result": {
      "type": "text",
      "file": {
        "filePath": "/work/claude-quest/GLOSSARY.md",
        "content": "# Claude Quest\n\nAn RPG layer over AI-assisted coding in Clau",
        "numLines": 78,
        "startLine": 1,
        "totalLines": 78
      },
      "filenames": null
    },
    "text": "1\t# Claude Quest\n2\t\n3\tAn RPG layer over AI-assisted coding i",
    "isReadOnly": true
  }
} as const

export const readMissing = {
  "input": {
    "file_path": "/work/claude-quest/does-not-exist.md",
    "tool": "Read",
    "tool_use_id": "toolu_017dP3q94oj2NkGKcRwA2eku"
  },
  "result": {
    "ref": 1,
    "result": "Error: File does not exist. Note: your current working directory is /work/claude-quest.",
    "text": "File does not exist. Note: your current working directory is /work/claude-quest.",
    "isError": true,
    "isReadOnly": true
  }
} as const

export const grep = {
  "input": {
    "pattern": "Mana",
    "path": "/work/claude-quest/GLOSSARY.md",
    "output_mode": "content",
    "-n": true,
    "tool": "Grep",
    "tool_use_id": "toolu_01SnHzTN96zBb16t7Latm6sy"
  },
  "result": {
    "ref": 1,
    "result": {
      "mode": "content",
      "numFiles": 0,
      "filenames": [],
      "content": "75:**Mana**:",
      "numLines": 1,
      "totalLines": 1,
      "file": {
        "content": null
      }
    },
    "text": "75:**Mana**:",
    "isReadOnly": true
  }
} as const

export const glob = {
  "input": {
    "pattern": "**/*.md",
    "path": "/work/claude-quest",
    "tool": "Glob",
    "tool_use_id": "toolu_01YBkTR1kTNZgN96E7bww1r2"
  },
  "result": {
    "ref": 1,
    "result": {
      "filenames": [
        "docs/vision.md",
        "docs/agents/issue-tracker.md",
        "docs/agents/triage-labels.md",
        "docs/agents/domain.md",
        "CLAUDE.md",
        "GLOSSARY.md"
      ],
      "durationMs": 8,
      "numFiles": 8,
      "truncated": false,
      "totalMatches": 8,
      "countIsComplete": true,
      "file": {
        "content": null
      }
    },
    "text": "docs/vision.md\ndocs/agents/issue-tracker.md\ndocs/agents/tria",
    "isReadOnly": true
  }
} as const

