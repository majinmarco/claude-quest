import { describe, expect, test } from 'claude-code/testing'

import { generateQuestion } from '../src/content-generator'
import type { Model, QuestionInput } from '../src/content-generator'

/** An edit the Sage asks about: a discount applied once an order is large. */
const LEDGER_DIFF = [
  '@@ -10,6 +10,9 @@ export const total = (order: Order): number => {',
  '   const subtotal = order.lines.reduce((sum, line) => sum + line.price * line.quantity, 0)',
  '-  return subtotal',
  '+  if (subtotal >= BULK_THRESHOLD) {',
  '+    return subtotal * (1 - BULK_DISCOUNT)',
  '+  }',
  '+  return subtotal',
  ' }',
].join('\n')

const INPUT: QuestionInput = {
  changes: [{ path: 'src/order-ledger.ts', diff: LEDGER_DIFF }],
  ticket: '#7 Bulk discounts',
}

/** What Haiku answers when it follows the contract. */
const REPLY = {
  question: 'When does total() apply the bulk discount?',
  options: [
    'When the subtotal is at least BULK_THRESHOLD',
    'When the order has more than BULK_THRESHOLD lines',
    'Always, after the subtotal is summed',
    'Only when the subtotal is below BULK_THRESHOLD',
  ],
  answer: 0,
  explanation: 'The new branch checks subtotal >= BULK_THRESHOLD before discounting.',
  stat: 'intelligence',
  path: 'src/order-ledger.ts',
  source_lines: ['  if (subtotal >= BULK_THRESHOLD) {', '    return subtotal * (1 - BULK_DISCOUNT)'],
}

/** A fake model answering `text`, keeping what it was asked. */
const answering = (text: string) => {
  const asked: Parameters<Model>[0][] = []
  const model: Model = async request => {
    asked.push(request)

    return { ok: true, text }
  }

  return { model, asked }
}

const replying = (reply: unknown) => answering(JSON.stringify(reply)).model

describe('Content Generator: a comprehension Question', () => {
  test('asks the model about the diff and the ticket, and returns the Question it answered', async () => {
    const { model, asked } = answering(JSON.stringify(REPLY))

    const generated = await generateQuestion(INPUT, model)

    expect(generated).toEqual({
      ok: true,
      question: {
        prompt: 'When does total() apply the bulk discount?',
        options: [
          'When the subtotal is at least BULK_THRESHOLD',
          'When the order has more than BULK_THRESHOLD lines',
          'Always, after the subtotal is summed',
          'Only when the subtotal is below BULK_THRESHOLD',
        ],
        answer: 0,
        explanation: 'The new branch checks subtotal >= BULK_THRESHOLD before discounting.',
        stat: 'intelligence',
        source: {
          path: 'src/order-ledger.ts',
          lines: ['  if (subtotal >= BULK_THRESHOLD) {', '    return subtotal * (1 - BULK_DISCOUNT)'],
        },
      },
    })
    expect(asked).toHaveLength(1)
    expect(asked[0]?.prompt).toContain(LEDGER_DIFF)
    expect(asked[0]?.prompt).toContain('src/order-ledger.ts')
    expect(asked[0]?.prompt).toContain('#7 Bulk discounts')
  })
})

describe('Content Generator: what is no Question', () => {
  const skipped = async (reply: unknown) => generateQuestion(INPUT, replying(reply))

  test('three options are rejected: a Question has exactly four', async () => {
    expect(await skipped({ ...REPLY, options: REPLY.options.slice(0, 3) })).toMatchObject({
      ok: false,
      reason: 'invalid',
    })
  })

  test('five options are rejected', async () => {
    expect(await skipped({ ...REPLY, options: [...REPLY.options, 'Never'] })).toMatchObject({
      ok: false,
      reason: 'invalid',
    })
  })

  test('the same option twice is rejected: one of them could not be wrong', async () => {
    const [first, second, third] = REPLY.options

    expect(await skipped({ ...REPLY, options: [first, second, third, first] })).toMatchObject({
      ok: false,
      reason: 'invalid',
    })
  })

  test('an answer past the last option is rejected', async () => {
    expect(await skipped({ ...REPLY, answer: 4 })).toMatchObject({ ok: false, reason: 'invalid' })
  })

  test('an answer that is not an index is rejected', async () => {
    expect(await skipped({ ...REPLY, answer: 'A' })).toMatchObject({ ok: false, reason: 'invalid' })
    expect(await skipped({ ...REPLY, answer: 1.5 })).toMatchObject({ ok: false, reason: 'invalid' })
  })

  test('a blank explanation is rejected: every answer shows one', async () => {
    expect(await skipped({ ...REPLY, explanation: '  ' })).toMatchObject({
      ok: false,
      reason: 'invalid',
    })
  })

  test('a Stat tag outside the allowed set is rejected', async () => {
    expect(await skipped({ ...REPLY, stat: 'charisma' })).toMatchObject({
      ok: false,
      reason: 'invalid',
    })
    expect(await skipped({ ...REPLY, stat: 'luck' })).toMatchObject({ ok: false, reason: 'invalid' })
  })

  test('a Wisdom tag is allowed: how the change fits the system', async () => {
    expect(await skipped({ ...REPLY, stat: 'wisdom' })).toMatchObject({
      ok: true,
      question: { stat: 'wisdom' },
    })
  })

  test('a source line that is not in the diff is rejected: the Player could not see it', async () => {
    expect(
      await skipped({ ...REPLY, source_lines: ['  if (order.isWholesale) {'] }),
    ).toMatchObject({ ok: false, reason: 'invalid' })
  })

  test('a removed line is rejected: it is no longer in the code the Player sees', async () => {
    expect(await skipped({ ...REPLY, source_lines: ['  return subtotal', '  if (subtotal >= BULK_THRESHOLD) {'] })).toMatchObject({
      ok: true,
    })
    const removedOnly = {
      changes: [{ path: 'src/order-ledger.ts', diff: '@@ -1,2 +1,1 @@\n const a = 1\n-const legacyRate = 0.2' }],
      ticket: null,
    }
    expect(
      await generateQuestion(removedOnly, replying({ ...REPLY, source_lines: ['const legacyRate = 0.2'] })),
    ).toMatchObject({ ok: false, reason: 'invalid' })
  })

  test('source lines that are only punctuation are rejected: a bare brace points at nothing', async () => {
    expect(await skipped({ ...REPLY, source_lines: ['}'] })).toMatchObject({ ok: false, reason: 'invalid' })
  })

  test('no source lines are rejected', async () => {
    expect(await skipped({ ...REPLY, source_lines: [] })).toMatchObject({
      ok: false,
      reason: 'invalid',
    })
  })

  test('a file that did not change is rejected', async () => {
    expect(await skipped({ ...REPLY, path: 'src/cart.ts' })).toMatchObject({
      ok: false,
      reason: 'invalid',
    })
  })

  test('a reply that holds no JSON is skipped as not-json', async () => {
    expect(await generateQuestion(INPUT, answering('The code applies a discount.').model)).toMatchObject({
      ok: false,
      reason: 'not-json',
    })
  })

  test('a model with no text is skipped as model-failed', async () => {
    const failing: Model = async () => ({ ok: false, reason: 'api-error' })

    expect(await generateQuestion(INPUT, failing)).toEqual({
      ok: false,
      reason: 'model-failed',
      detail: 'api-error',
    })
  })

  test('a model that throws is skipped too, never thrown on', async () => {
    const throwing: Model = async () => {
      throw new Error('blocked model')
    }

    expect(await generateQuestion(INPUT, throwing)).toMatchObject({ ok: false, reason: 'model-failed' })
  })

  test('a change with no diff asks nothing: the model is not called', async () => {
    const { model, asked } = answering(JSON.stringify(REPLY))

    expect(await generateQuestion({ changes: [{ path: 'a.ts', diff: '' }], ticket: null }, model)).toMatchObject({
      ok: false,
      reason: 'no-change',
    })
    expect(asked).toHaveLength(0)
  })
})

describe('Content Generator: what Haiku writes loosely', () => {
  test('a fenced reply is read', async () => {
    const fenced = answering(`\`\`\`json\n${JSON.stringify(REPLY)}\n\`\`\``).model

    expect(await generateQuestion(INPUT, fenced)).toMatchObject({ ok: true })
  })

  test('source lines copied without indentation, or with the diff mark, are found and kept as the diff has them', async () => {
    const generated = await generateQuestion(
      INPUT,
      replying({
        ...REPLY,
        source_lines: ['if (subtotal >= BULK_THRESHOLD) {', '+    return subtotal * (1 - BULK_DISCOUNT)'],
      }),
    )

    expect(generated).toMatchObject({
      ok: true,
      question: {
        source: {
          path: 'src/order-ledger.ts',
          lines: ['  if (subtotal >= BULK_THRESHOLD) {', '    return subtotal * (1 - BULK_DISCOUNT)'],
        },
      },
    })
  })

  test('with one file changed, a reply naming no file means that one', async () => {
    const { path: _, ...unnamed } = REPLY

    expect(await generateQuestion(INPUT, replying(unnamed))).toMatchObject({
      ok: true,
      question: { source: { path: 'src/order-ledger.ts' } },
    })
  })

  test('with several files changed, the Question is about the file it names', async () => {
    const twoFiles: QuestionInput = {
      changes: [
        { path: 'src/cart.ts', diff: '@@ -1,1 +1,1 @@\n-const items = []\n+const items: Item[] = []' },
        { path: 'src/order-ledger.ts', diff: LEDGER_DIFF },
      ],
      ticket: null,
    }

    const generated = await generateQuestion(twoFiles, replying(REPLY))

    expect(generated).toMatchObject({ ok: true, question: { source: { path: 'src/order-ledger.ts' } } })
  })
})

describe('Content Generator: what is sent', () => {
  test('with no Quest active the prompt says no ticket is', async () => {
    const { model, asked } = answering(JSON.stringify(REPLY))

    await generateQuestion({ ...INPUT, ticket: null }, model)

    expect(asked[0]?.prompt).toContain('No ticket is active.')
  })

  test('the system prompt holds the contract: four options, one JSON object', async () => {
    const { model, asked } = answering(JSON.stringify(REPLY))

    await generateQuestion(INPUT, model)

    expect(asked[0]?.system).toMatch(/four options/i)
    expect(asked[0]?.system).toMatch(/JSON/)
  })

  test('a huge change sends whole hunks up to the limit, the rest left out', async () => {
    const hunk = (n: number) => `@@ -${n},1 +${n},1 @@\n-${'a'.repeat(5000)}\n+line ${n}`
    const { model, asked } = answering(JSON.stringify(REPLY))

    await generateQuestion(
      { changes: [{ path: 'big.ts', diff: [1, 2, 3, 4].map(hunk).join('\n') }], ticket: null },
      model,
    )

    expect(asked[0]?.prompt).toContain('+line 2')
    expect(asked[0]?.prompt).not.toContain('+line 3')
  })
})
