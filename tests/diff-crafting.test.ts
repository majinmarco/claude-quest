import { describe, expect, test } from 'claude-code/testing'

import { changesSince, diffLines, hunksBetween, MAX_DIFF_EDITS, noteChanged, takeSnapshot } from '../src/diff-crafting'
import { newGame, step } from '../src/engine'
import { cacheKeyOf } from '../src/question-cache'
import { codeLines, fakeRepo } from './fixtures/fake-git'

const ROOT = '/work/forge'

/** A repo, its snapshot taken as the session starts. */
const watched = async (files: Record<string, string> = {}) => {
  const repo = fakeRepo(files)
  const snapshot = await takeSnapshot(repo.git, repo.read)
  if (snapshot === null) {
    throw new Error('no snapshot')
  }

  return { ...repo, snapshot, check: () => changesSince(snapshot, repo.git, repo.read, ROOT) }
}

describe('Crafting from the diff: what git sees', () => {
  test('a file a heredoc created is a new file: all its lines added, its path absolute, in its Module', async () => {
    const repo = await watched({ 'src/engine.ts': codeLines(20) })
    repo.work.set('src/order-ledger.ts', codeLines(5))

    expect(await repo.check()).toEqual([
      {
        type: 'FILE_EDIT',
        path: '/work/forge/src/order-ledger.ts',
        module: 'src',
        isNewFile: true,
        linesBefore: null,
        linesAdded: 5,
        linesRemoved: 0,
        diff: `@@ -0,0 +1,5 @@\n${codeLines(5).replace(/\n$/, '').split('\n').map(line => `+${line}`).join('\n')}`,
        source: 'diff',
      },
    ])
  })

  test('a tracked file a script edited is diffed against HEAD: the lines it changed, with their context', async () => {
    const repo = await watched({ 'src/engine.ts': codeLines(30) })
    const lines = codeLines(30).split('\n')
    lines.splice(10, 12, ...codeLines(12, 11, 'changed').replace(/\n$/, '').split('\n'))
    repo.work.set('src/engine.ts', lines.join('\n'))

    const [edit] = await repo.check()

    expect(edit).toMatchObject({ path: '/work/forge/src/engine.ts', isNewFile: false, linesBefore: 30, linesAdded: 12, linesRemoved: 12, source: 'diff' })
    expect(edit?.diff.split('\n')[0]).toBe('@@ -8,18 +8,18 @@')
  })

  test('the same change is played once: a second check finds nothing new', async () => {
    const repo = await watched()
    repo.work.set('src/a.ts', codeLines(5))

    expect(await repo.check()).toHaveLength(1)
    expect(await repo.check()).toEqual([])
  })

  test('work done before the session started is never played; a later change to it is diffed against what the session saw', async () => {
    const repo = fakeRepo({ 'src/a.ts': codeLines(20) })
    repo.work.set('src/a.ts', codeLines(25))
    repo.work.set('src/draft.ts', codeLines(8))
    const snapshot = await takeSnapshot(repo.git, repo.read)
    if (snapshot === null) {
      throw new Error('no snapshot')
    }

    expect(await changesSince(snapshot, repo.git, repo.read, ROOT)).toEqual([])

    repo.work.set('src/a.ts', codeLines(27))
    const [edit] = await changesSince(snapshot, repo.git, repo.read, ROOT)
    expect(edit).toMatchObject({ isNewFile: false, linesBefore: 25, linesAdded: 2, linesRemoved: 0 })
  })

  test('a file an Edit already played is noted, so the diff path does not play it again', async () => {
    const repo = await watched({ 'src/a.ts': codeLines(20) })
    repo.work.set('src/a.ts', codeLines(40))
    await noteChanged(repo.snapshot, repo.git, repo.read, ROOT, '/work/forge/src/a.ts')

    expect(await repo.check()).toEqual([])

    // A later Bash edit of it is diffed from what the Edit left.
    repo.work.set('src/a.ts', codeLines(42))
    expect(await repo.check()).toMatchObject([{ linesBefore: 40, linesAdded: 2 }])
  })

  test('a file outside the root is not the snapshot\'s to note', async () => {
    const repo = await watched()
    await noteChanged(repo.snapshot, repo.git, repo.read, ROOT, '/home/marco/.claude/settings.json')

    expect([...repo.snapshot.keys()]).toEqual([])
  })

  test('an ignored file never counts', async () => {
    const repo = await watched()
    repo.ignored.add('dist/bundle.js')
    repo.work.set('dist/bundle.js', codeLines(50))

    expect(await repo.check()).toEqual([])
  })

  test('a binary file, a deleted file and a file put back as HEAD has it play nothing', async () => {
    const repo = await watched({ 'assets/logo.png': 'PNG', 'src/gone.ts': codeLines(12), 'src/back.ts': codeLines(12) })
    repo.binary.add('assets/logo.png')
    repo.work.set('assets/logo.png', 'PNG2')
    repo.work.delete('src/gone.ts')
    repo.work.set('src/back.ts', codeLines(30))
    expect(await repo.check()).toHaveLength(1)

    repo.work.set('src/back.ts', codeLines(12))
    expect(await repo.check()).toEqual([])
    expect([...repo.snapshot.keys()]).toEqual([])
  })

  test(`at most ${MAX_DIFF_EDITS} files a check; the rest are taken in unplayed`, async () => {
    const repo = await watched()
    for (let at = 0; at < MAX_DIFF_EDITS + 5; at++) {
      repo.work.set(`gen/file-${String(at).padStart(2, '0')}.ts`, codeLines(4))
    }

    expect(await repo.check()).toHaveLength(MAX_DIFF_EDITS)
    expect(await repo.check()).toEqual([])
  })

  test('the same change from the same state is the same diff, so its Question cache key is the same', async () => {
    const one = await watched({ 'src/a.ts': codeLines(20) })
    const two = await watched({ 'src/a.ts': codeLines(20) })
    one.work.set('src/a.ts', codeLines(32))
    two.work.set('src/a.ts', codeLines(32))
    const [first] = await one.check()
    const [second] = await two.check()

    expect(await cacheKeyOf([{ path: first?.path ?? '', diff: first?.diff ?? '' }])).toBe(
      await cacheKeyOf([{ path: second?.path ?? '', diff: second?.diff ?? '' }]),
    )
  })
})

describe('Crafting from the diff: off without git', () => {
  test('not a git repo: no snapshot, so the diff path is off', async () => {
    const repo = fakeRepo({}, { isRepo: false })

    expect(await takeSnapshot(repo.git, repo.read)).toBeNull()
  })

  test('git missing: no snapshot, no error', async () => {
    const repo = fakeRepo({}, { isMissing: true })

    expect(await takeSnapshot(repo.git, repo.read)).toBeNull()
  })

  test('git failing after the snapshot plays nothing and keeps the snapshot', async () => {
    const repo = await watched()
    repo.work.set('src/a.ts', codeLines(5))
    const failing = async () => ({ exitCode: 128, stdout: '' })

    expect(await changesSince(repo.snapshot, failing, repo.read, ROOT)).toEqual([])
    expect(await repo.check()).toHaveLength(1)
  })
})

describe('Crafting from the diff: the Crafting rules, unchanged', () => {
  /** What the Game Engine plays for the diff path's edits. */
  const played = async (before: Record<string, string>, after: Record<string, string>) => {
    const repo = await watched(before)
    for (const [path, text] of Object.entries(after)) {
      repo.work.set(path, text)
    }
    let state = newGame()
    const effects = []
    for (const edit of await repo.check()) {
      const stepped = step(state, edit)
      state = stepped.state
      effects.push(...stepped.effects)
    }

    return effects.map(effect => effect.type)
  }

  test('a new file of 3 lines or more forges, and the Sage asks about it', async () => {
    expect(await played({}, { 'src/a.ts': codeLines(3) })).toEqual(['ENCOUNTER_STARTED', 'CODE_CHANGED', 'XP_GAINED'])
  })

  test('a new file of 2 lines forges nothing', async () => {
    expect(await played({}, { 'src/a.ts': codeLines(2) })).toEqual([])
  })

  test('a major edit of 10 lines forges; 9 lines does not', async () => {
    const lines = (changed: number) => codeLines(40).replace(codeLines(changed, 1), codeLines(changed, 1, 'other'))

    expect(await played({ 'src/a.ts': codeLines(40) }, { 'src/a.ts': lines(10) })).toContain('CODE_CHANGED')
    expect(await played({ 'src/a.ts': codeLines(40) }, { 'src/a.ts': lines(9) })).toEqual([])
  })

  test('a near-complete rewrite of a small file forges', async () => {
    expect(await played({ 'src/a.ts': codeLines(4) }, { 'src/a.ts': codeLines(4, 1, 'other') })).toContain('CODE_CHANGED')
  })
})

describe('Crafting from the diff: the line diff', () => {
  test('one line changed in the middle: one hunk, three lines of context either side', () => {
    const before = codeLines(20)
    const after = before.replace('export const line10 = 10', 'export const line10 = 100')

    expect(hunksBetween(before, after)).toEqual([
      {
        oldStart: 7,
        oldLines: 7,
        newStart: 7,
        newLines: 7,
        lines: [
          ' export const line7 = 7',
          ' export const line8 = 8',
          ' export const line9 = 9',
          '-export const line10 = 10',
          '+export const line10 = 100',
          ' export const line11 = 11',
          ' export const line12 = 12',
          ' export const line13 = 13',
        ],
      },
    ])
  })

  test('changes far apart are two hunks; close ones, one', () => {
    const before = codeLines(40)
    const far = before.replace('line2 = 2', 'line2 = 22').replace('line30 = 30', 'line30 = 33')
    const close = before.replace('line2 = 2', 'line2 = 22').replace('line6 = 6', 'line6 = 66')

    expect(hunksBetween(before, far)).toHaveLength(2)
    expect(hunksBetween(before, close)).toHaveLength(1)
  })

  test('the fewest steps: a line inserted is one addition, not a rewrite', () => {
    const steps = diffLines(['a', 'b', 'c', 'd'], ['a', 'b', 'x', 'c', 'd'])

    expect(steps.filter(each => each.kind !== ' ')).toEqual([{ kind: '+', line: 'x' }])
  })

  test('interleaved changes are found as such', () => {
    const steps = diffLines(['a', 'b', 'c', 'a', 'b', 'b', 'a'], ['c', 'b', 'a', 'b', 'a', 'c'])

    expect(steps.filter(each => each.kind === '-').length + steps.filter(each => each.kind === '+').length).toBe(5)
    expect(steps.filter(each => each.kind !== '+').map(each => each.line)).toEqual(['a', 'b', 'c', 'a', 'b', 'b', 'a'])
    expect(steps.filter(each => each.kind !== '-').map(each => each.line)).toEqual(['c', 'b', 'a', 'b', 'a', 'c'])
  })
})
