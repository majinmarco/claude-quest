import { describe, expect, test } from 'claude-code/testing'

import { MAX_BASH_READS, translateBashReads } from '../src/bash-reads'
import * as bash from './fixtures/bash-calls'

/** The project's root, as `$.session.root()` answers in the recorded session. */
const ROOT = '/work/claude-quest'

/** The FILE_READs a recorded Bash call plays. */
const readsOf = (call: { input: unknown; result: unknown }, root: string | null = ROOT) =>
  translateBashReads(call.input as never, call.result as never, root).reads

describe('Bash reads: the commands that read', () => {
  test('cat reads its file, in its folder', () => {
    expect(readsOf(bash.catFile)).toEqual([{ type: 'FILE_READ', path: 'src/a.ts', module: 'src' }])
  })

  test('sed -n reads the file after its script', () => {
    expect(readsOf(bash.sedRange)).toEqual([{ type: 'FILE_READ', path: 'src/b.ts', module: 'src' }])
  })

  test('grep -rn searches the folder it names, its pattern left out', () => {
    expect(readsOf(bash.grepRecursive)).toEqual([{ type: 'FILE_READ', path: 'src/', module: 'src' }])
  })

  test('rg searches the folder after its pattern', () => {
    expect(readsOf(bash.rgTests)).toEqual([{ type: 'FILE_READ', path: 'tests', module: 'tests' }])
  })

  test('find searches the folders before its expression', () => {
    expect(readsOf(bash.findSearch)).toEqual([{ type: 'FILE_READ', path: 'src', module: 'src' }])
  })

  test('a chain reads in every segment, after the folder it moved to, value flags left out', () => {
    expect(readsOf(bash.readChain)).toEqual([
      { type: 'FILE_READ', path: 'src/engine.ts', module: 'src' },
      { type: 'FILE_READ', path: 'src/translate.ts', module: 'src' },
      { type: 'FILE_READ', path: 'src/../README.md', module: '.' },
    ])
  })

  test('grep filtering a pipe searches nothing of its own', () => {
    expect(readsOf(bash.pipedGrep)).toEqual([{ type: 'FILE_READ', path: 'src/a.ts', module: 'src' }])
  })

  test('a search with no path searches where it runs: rg, recursive grep; plain grep reads its input', () => {
    const run = (command: string) => readsOf({ ...bash.catFile, input: { ...bash.catFile.input, command } })

    expect(run('rg FILE_EDIT')).toEqual([{ type: 'FILE_READ', path: '.', module: '.' }])
    expect(run('grep -R FILE_EDIT')).toEqual([{ type: 'FILE_READ', path: '.', module: '.' }])
    expect(run('grep FILE_EDIT')).toEqual([])
    expect(run('grep -e FILE_EDIT -e FILE_READ src/engine.ts')).toEqual([
      { type: 'FILE_READ', path: 'src/engine.ts', module: 'src' },
    ])
  })

  test('the other readers: head, tail, less, bat, nl, wc, awk', () => {
    const run = (command: string) => readsOf({ ...bash.catFile, input: { ...bash.catFile.input, command } })

    expect(run('head -20 src/a.ts')).toEqual([{ type: 'FILE_READ', path: 'src/a.ts', module: 'src' }])
    expect(run('tail -n 5 docs/vision.md')).toEqual([{ type: 'FILE_READ', path: 'docs/vision.md', module: 'docs' }])
    expect(run('less README.md')).toEqual([{ type: 'FILE_READ', path: 'README.md', module: '.' }])
    expect(run('bat -r 1:40 hooks/register.tsx')).toEqual([{ type: 'FILE_READ', path: 'hooks/register.tsx', module: 'hooks' }])
    expect(run('nl -ba src/a.ts')).toEqual([{ type: 'FILE_READ', path: 'src/a.ts', module: 'src' }])
    expect(run("awk -F: '{print $1}' tests/a.test.ts")).toEqual([{ type: 'FILE_READ', path: 'tests/a.test.ts', module: 'tests' }])
    expect(run('ag TODO scripts')).toEqual([{ type: 'FILE_READ', path: 'scripts', module: 'scripts' }])
  })
})

describe('Bash reads: what reads nothing', () => {
  test('sed -i edits: no read', () => {
    expect(readsOf(bash.sedInPlace)).toEqual([])
    const run = (command: string) => readsOf({ ...bash.catFile, input: { ...bash.catFile.input, command } })
    expect(run("sed -ni.bak 's/a/b/p' src/a.ts")).toEqual([])
    expect(run("sed --in-place 's/a/b/' src/a.ts")).toEqual([])
  })

  test('a failed command reads nothing: a missing file, grep matching nothing', () => {
    expect(readsOf(bash.catMissing)).toEqual([])
    expect(readsOf(bash.grepNoMatch)).toEqual([])
  })

  test('paths outside the project, or unexpanded, read nothing', () => {
    expect(readsOf(bash.catOutside)).toEqual([])
  })

  test('an ignored folder is in no Module: no read', () => {
    expect(readsOf(bash.nodeModulesRead)).toEqual([])
  })

  test('without the root, nothing is read', () => {
    expect(readsOf(bash.catFile, null)).toEqual([])
  })

  test(`at most ${MAX_BASH_READS} reads a call`, () => {
    expect(readsOf(bash.catMany).map(read => read.path)).toEqual([
      'src/a.ts',
      'docs/b.md',
      'tests/c.ts',
      'hooks/d.tsx',
      'scripts/e.mjs',
    ])
  })

  test('cat writing a file through a heredoc reads nothing', () => {
    expect(readsOf(bash.heredocWrite)).toEqual([])
  })

  test('find deleting or running a command is no read', () => {
    expect(readsOf(bash.findDelete)).toEqual([])
    const run = (command: string) => readsOf({ ...bash.catFile, input: { ...bash.catFile.input, command } })
    expect(run('find src -name x -exec rm {} +')).toEqual([])
  })

  test('a command substitution or a subshell is not read', () => {
    const run = (command: string) => readsOf({ ...bash.catFile, input: { ...bash.catFile.input, command } })
    expect(run('cat $(git ls-files src)')).toEqual([])
    expect(run('(cd src && cat a.ts)')).toEqual([])
  })

  test('a denied call reads nothing', () => {
    expect(translateBashReads(bash.catFile.input, { deny: 'no' }, ROOT).reads).toEqual([])
  })
})

describe('Bash reads: read-only commands', () => {
  test('reads and cd alone are read-only: no diff check after them', () => {
    expect(translateBashReads(bash.readChain.input, bash.readChain.result, ROOT).isReadOnly).toBe(true)
    expect(translateBashReads(bash.catMissing.input, bash.catMissing.result as never, ROOT).isReadOnly).toBe(true)
  })

  test('a write, a script or sed -i is not read-only, though its reads still count', () => {
    expect(translateBashReads(bash.heredocWrite.input, bash.heredocWrite.result, ROOT).isReadOnly).toBe(false)
    expect(translateBashReads(bash.sedInPlace.input, bash.sedInPlace.result, ROOT).isReadOnly).toBe(false)
    const script = translateBashReads(bash.pythonWrite.input, bash.pythonWrite.result, ROOT)
    expect(script.isReadOnly).toBe(false)
    expect(script.reads).toEqual([{ type: 'FILE_READ', path: 'src/generated.ts', module: 'src' }])
  })
})
