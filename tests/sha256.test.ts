import { describe, expect, test } from 'claude-code/testing'

import { sha256Of } from '../src/question-cache'

describe('Cache keys: SHA-256', () => {
  test('hashes as Web Crypto does, so keys cached before still match: empty, short, a block boundary, many blocks of UTF-8', async () => {
    expect(await sha256Of('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(await sha256Of('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
    expect(await sha256Of('x'.repeat(56))).toBe('04c26261370ee7541549d16dee320c723e3fd14671e66a099afe0a377c16888e')
    expect(await sha256Of('h\u00e9llo \u2713 '.repeat(100))).toBe('38a5a733f1a891a064ffbf978f8ee880835baeb678b40591cfab234149c374ce')
  })
})
