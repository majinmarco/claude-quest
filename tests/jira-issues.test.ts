import { describe, expect, test } from 'claude-code/testing'
import type { McpToolResult } from 'claude-code'

import { jiraIssues } from '../src/jira-issues'
import type { JiraSettings } from '../src/jira-issues'
import { questSourceContract } from './quest-source-contract'
import type { ContractTicket, ContractWorld } from './quest-source-contract'

/** An issue as the Atlassian MCP's searchJiraIssuesUsingJql and getJiraIssue write it. */
type JiraIssue = {
  id: string
  key: string
  webUrl: string
  fields: {
    summary: string
    labels: string[]
    issuetype: { name: string }
    status: { name: string; statusCategory: { key: 'new' | 'indeterminate' | 'done' } }
    /** Markdown, as the server writes a description by default. */
    description?: string
    /** Custom fields by their label on the site, as the Atlassian MCP maps them. */
    customFields?: Record<string, { id: string; value: unknown }>
    /** The issue's parent: an epic, or a story for a subtask. */
    parent?: { id: string; key: string; fields: { summary: string; issuetype: { name: string; subtask: boolean } } }
  }
}

const SITE = 'https://example.atlassian.net'
const CLOUD_ID = 'a873898b-0000-4000-8000-000000000000'
const POINTS_FIELD = 'customfield_10016'
const SERVER = 'claude.ai Atlassian MCP'

/** A tool's answer as text, as the Atlassian MCP answers every call. */
const answered = (value: unknown, isError = false): McpToolResult => ({
  content: [{ type: 'text', text: JSON.stringify(value) }],
  isError,
})

// What the Atlassian MCP answers when Jira refuses, as seen on a real site.
const notFound = (key: string) =>
  answered({ error: true, message: `Issue "${key}" not found`, statusCode: 404 }, true)

type Call = { server: string; tool: string; args: Record<string, unknown> }

/**
 * A fake Atlassian MCP over one site's issues: it answers
 * getAccessibleAtlassianResources, searchJiraIssuesUsingJql (open issues,
 * `pageSize` a page, paged by nextPageToken) and getJiraIssue. `calls` records
 * every call.
 */
const fakeAtlassian = (issues: JiraIssue[], { pageSize = 100 } = {}) => {
  const calls: Call[] = []

  const call = async (server: string, tool: string, args: Record<string, unknown> = {}) => {
    calls.push({ server, tool, args })

    if (tool === 'getAccessibleAtlassianResources') {
      return answered({
        data: {
          resources: [
            { cloudId: CLOUD_ID, url: SITE, products: [{ id: 'jira', access: 'read-write' }] },
          ],
        },
      })
    }

    if (tool === 'searchJiraIssuesUsingJql') {
      const isDone = /statusCategory = Done/.test(String(args.jql))
      const open = issues.filter(issue => (issue.fields.status.statusCategory.key === 'done') === isDone)
      const from = Number(args.nextPageToken ?? 0)
      const page = open.slice(from, from + pageSize)
      const hasNextPage = from + pageSize < open.length

      return answered({
        issues: {
          nodes: page,
          pageInfo: hasNextPage
            ? { hasNextPage, endCursor: String(from + pageSize) }
            : { hasNextPage },
        },
      })
    }

    if (tool === 'getJiraIssue') {
      const key = String(args.issueIdOrKey)
      const issue = issues.find(one => one.key === key)

      return issue === undefined ? notFound(key) : answered({ issues: { nodes: [issue] } })
    }

    return answered({ error: true, message: `Unknown tool ${tool}`, statusCode: 400 }, true)
  }

  return { call, calls }
}

const KIND_TYPE = { bug: 'Bug', feature: 'Story', docs: 'Task' } as const

/** A contract ticket as a Jira issue: points in the story points field, size a label. */
const asIssue = (ticket: ContractTicket): JiraIssue => ({
  id: String(10000 + ticket.n),
  key: `QUEST-${ticket.n}`,
  webUrl: `${SITE}/browse/QUEST-${ticket.n}`,
  fields: {
    summary: ticket.title,
    labels: [
      ...(ticket.size === undefined ? [] : [`size: ${ticket.size}`]),
      ...(ticket.triage === undefined ? [] : [ticket.triage]),
    ],
    issuetype: { name: ticket.kind === undefined ? 'Task' : KIND_TYPE[ticket.kind] },
    status: ticket.closed === true
      ? { name: 'Done', statusCategory: { key: 'done' } }
      : { name: ticket.status ?? 'To Do', statusCategory: { key: 'new' } },
    ...(ticket.epic === undefined ? {} : { parent: epicOf(ticket.epic) }),
    ...(ticket.description === undefined ? {} : { description: ticket.description }),
    ...(ticket.points === undefined
      ? {}
      : { customFields: { 'Story point estimate': { id: POINTS_FIELD, value: ticket.points } } }),
  },
})

/** An epic named `summary` as an issue's parent, its key made from its name. */
const epicOf = (summary: string) => {
  const n = ([...summary].reduce((sum, letter) => sum * 31 + letter.charCodeAt(0), 7) % 997) + 1

  return {
    id: String(20000 + n),
    key: `QUEST-${1000 + n}`,
    fields: { summary, issuetype: { name: 'Epic', subtask: false } },
  }
}

const SETTINGS: JiraSettings = { project: 'QUEST', storyPointsField: POINTS_FIELD }

const failing = (failure: Extract<ContractWorld, { failure: unknown }>['failure']) =>
  async (): Promise<McpToolResult> => {
    switch (failure) {
      case 'missing':
        throw new Error(`MCP server "${SERVER}" is not connected`)
      case 'unauthenticated':
        return answered({ error: true, message: 'Unauthorized', statusCode: 401 }, true)
      case 'unreachable':
        return answered({ error: true, message: 'Service Unavailable', statusCode: 503 }, true)
      case 'misconfigured':
        return answered({ error: true, message: "JQL validation failed: The value 'QUEST' does not exist for the field 'project'.", statusCode: 400 }, true)
      case 'forbidden':
        return answered({ error: true, message: 'Forbidden', statusCode: 403 }, true)
      default:
        throw new Error(`Jira cannot fail as ${failure}`)
    }
  }

questSourceContract({
  name: 'Jira',
  source: world =>
    jiraIssues(
      'failure' in world ? failing(world.failure) : fakeAtlassian(world.tickets.map(asIssue)).call,
      SETTINGS,
    ),
  ticket: n => `QUEST-${n}`,
  failures: ['missing', 'unauthenticated', 'unreachable', 'misconfigured', 'forbidden'],
})

const issue = (
  fields: Partial<JiraIssue['fields']> = {},
  n = 7,
): JiraIssue => ({
  ...asIssue({ n, title: 'Seven' }),
  fields: { ...asIssue({ n, title: 'Seven' }).fields, ...fields },
})

const listed = async (issues: JiraIssue[], settings: JiraSettings = SETTINGS) => {
  const result = await jiraIssues(fakeAtlassian(issues).call, settings).list()
  if (!result.ok) {
    throw new Error(result.problem.message)
  }

  return result.value
}

describe('Jira adapter', () => {
  test("lists the project's open issues through the Atlassian MCP, on the site it can reach", async () => {
    const atlassian = fakeAtlassian([issue()])
    await jiraIssues(atlassian.call, SETTINGS).list()

    expect(atlassian.calls.map(one => [one.server, one.tool])).toEqual([
      [SERVER, 'getAccessibleAtlassianResources'],
      [SERVER, 'searchJiraIssuesUsingJql'],
    ])
    const search = atlassian.calls[1]?.args
    expect(search?.cloudId).toBe(CLOUD_ID)
    expect(search?.jql).toBe('project = "QUEST" AND statusCategory != Done ORDER BY created DESC')
    expect(search?.fields).toContain(POINTS_FIELD)
  })

  test('finds the site once, then reuses it', async () => {
    const atlassian = fakeAtlassian([issue()])
    const quests = jiraIssues(atlassian.call, SETTINGS)
    await quests.list()
    await quests.list()
    await quests.get('QUEST-7')

    const discoveries = atlassian.calls.filter(one => one.tool === 'getAccessibleAtlassianResources')
    expect(discoveries).toHaveLength(1)
  })

  test('a site in the settings is used as it is, without looking one up', async () => {
    const atlassian = fakeAtlassian([issue()])
    await jiraIssues(atlassian.call, { ...SETTINGS, site: SITE }).list()

    expect(atlassian.calls.map(one => one.tool)).toEqual(['searchJiraIssuesUsingJql'])
    expect(atlassian.calls[0]?.args.cloudId).toBe(SITE)
  })

  test('the server and the JQL can be set', async () => {
    const atlassian = fakeAtlassian([issue()])
    const jql = 'project = QUEST AND sprint in openSprints()'
    await jiraIssues(atlassian.call, { ...SETTINGS, server: 'atlassian', jql }).list()

    expect(atlassian.calls.every(one => one.server === 'atlassian')).toBe(true)
    expect(atlassian.calls[1]?.args.jql).toBe(jql)
  })

  test("a subtask's parent is its story, not an epic: the subtask is in the Wilds", async () => {
    const story = { id: '1', key: 'QUEST-3', fields: { summary: 'A story', issuetype: { name: 'Story', subtask: false } } }
    const [subtask] = await listed([issue({ issuetype: { name: 'Sub-task', subtask: true } as { name: string }, parent: story })])

    expect(subtask?.dungeon).toBeUndefined()
  })

  test('an epic with no summary is named by its key', async () => {
    const epic = { id: '1', key: 'QUEST-2', fields: { summary: '', issuetype: { name: 'Epic', subtask: false } } }
    const [quest] = await listed([issue({ parent: epic })])

    expect(quest?.dungeon).toEqual({ key: 'QUEST-2', name: 'QUEST-2' })
  })

  test("the closed listing asks for the project's done issues, whatever the JQL set", async () => {
    const atlassian = fakeAtlassian([issue()])
    await jiraIssues(atlassian.call, { ...SETTINGS, site: SITE, jql: 'project = QUEST AND sprint in openSprints()' }).listClosed()

    expect(atlassian.calls[0]?.args.jql).toBe('project = "QUEST" AND statusCategory = Done ORDER BY updated DESC')
    expect(atlassian.calls[0]?.args.fields).toContain('parent')
  })

  test('carries the issue key, its browse URL and its status', async () => {
    const [quest] = await listed([issue()])

    expect(quest).toMatchObject({
      ticket: 'QUEST-7',
      url: `${SITE}/browse/QUEST-7`,
      status: 'To Do',
    })
  })

  test('without a story points field set, custom fields are not read', async () => {
    const atlassian = fakeAtlassian([
      issue({ customFields: { 'Story Points': { id: 'customfield_10028', value: 5 } } }),
    ])
    const result = await jiraIssues(atlassian.call, { project: 'QUEST' }).list()

    expect(result).toMatchObject({ ok: true, value: [{ difficulty: 'Unrated' }] })
    expect(atlassian.calls[1]?.args.fields).toEqual(['summary', 'status', 'labels', 'issuetype', 'parent'])
  })

  test('story points set by the field id win over a points label', async () => {
    const [quest] = await listed([
      issue({
        labels: ['points: 1'],
        customFields: { 'Story point estimate': { id: POINTS_FIELD, value: 8 } },
      }),
    ])

    expect(quest?.difficulty).toBe('Epic')
  })

  test('without a story points field, a points label sets the difficulty', async () => {
    expect((await listed([issue({ labels: ['sp: 2'] })]))[0]?.difficulty).toBe('Easy')
  })

  test('labels and the issue type recommend the Stats', async () => {
    const [bugLabelled, bug] = await listed([
      issue({ labels: ['regression'] }, 1),
      issue({ issuetype: { name: 'Bug' }, labels: ['enhancement'] }, 2),
    ])

    expect(bugLabelled?.recommendedStats).toEqual(['strength'])
    expect(bug?.recommendedStats).toEqual(['strength', 'intelligence'])
  })

  test('reads every page of a long listing', async () => {
    const issues = Array.from({ length: 5 }, (_, at) => issue({}, at + 1))
    const atlassian = fakeAtlassian(issues, { pageSize: 2 })
    const result = await jiraIssues(atlassian.call, SETTINGS).list()

    expect(result.ok && result.value.map(quest => quest.ticket)).toEqual([
      'QUEST-1',
      'QUEST-2',
      'QUEST-3',
      'QUEST-4',
      'QUEST-5',
    ])
    expect(atlassian.calls.filter(one => one.tool === 'searchJiraIssuesUsingJql')[1]?.args
      .nextPageToken).toBe('2')
  })

  test('a browse URL gets the Quest, as /implement reads one', async () => {
    const result = await jiraIssues(fakeAtlassian([issue()]).call, SETTINGS).get(
      `${SITE}/browse/QUEST-7`,
    )

    expect(result).toMatchObject({ ok: true, value: { ticket: 'QUEST-7' } })
  })

  test('a reference that is not a Jira key gets no Quest, without calling the server', async () => {
    const atlassian = fakeAtlassian([issue()])
    const result = await jiraIssues(atlassian.call, SETTINGS).get('#7')

    expect(result).toEqual({ ok: true, value: null })
    expect(atlassian.calls).toHaveLength(0)
  })

  test('a server that cannot be called for want of sign-in is unauthenticated', async () => {
    const result = await jiraIssues(async () => {
      throw new Error('MCP server "claude.ai Atlassian MCP" needs authentication')
    }, SETTINGS).list()

    expect(result).toMatchObject({ ok: false, problem: { kind: 'unauthenticated' } })
  })

  test('a missing connection says to connect the Atlassian server', async () => {
    const result = await jiraIssues(failing('missing'), SETTINGS).list()

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.problem.message).toContain(SERVER)
      expect(result.problem.message).toContain('/mcp')
    }
  })

  test('an account with no Jira site is misconfigured, and says so', async () => {
    const result = await jiraIssues(
      async () => answered({ data: { resources: [] } }),
      SETTINGS,
    ).list()

    expect(result).toMatchObject({ ok: false, problem: { kind: 'misconfigured' } })
  })

  test('a project the account cannot see (403) is forbidden, and says what to check', async () => {
    const result = await jiraIssues(failing('forbidden'), { ...SETTINGS, site: SITE }).list()

    expect(result).toEqual({
      ok: false,
      problem: {
        kind: 'forbidden',
        message: "Your Atlassian account can't see project QUEST (403): check questSource.project or ask for Browse permission.",
      },
    })
  })

  test('getJiraIssue answering with the bare issue, not a page, still gets it', async () => {
    const bare = async (_: string, tool: string): Promise<McpToolResult> =>
      tool === 'getJiraIssue' ? answered(issue({ description: 'Orders of 10 or more.' })) : answered({})
    const result = await jiraIssues(bare, { ...SETTINGS, site: SITE }).get('QUEST-7')

    expect(result).toMatchObject({ ok: true, value: { ticket: 'QUEST-7', summary: 'Orders of 10 or more.' } })
  })

  test('a description in Atlassian Document Format is read as its text', async () => {
    const adf = {
      type: 'doc',
      version: 1,
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Orders of 10' }, { type: 'text', text: ' or more.' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Get 10% off.' }] },
      ],
    }
    const described = async (_: string, tool: string): Promise<McpToolResult> =>
      tool === 'getJiraIssue'
        ? answered({ issues: { nodes: [{ ...issue(), fields: { ...issue().fields, description: adf } }] } })
        : answered({})
    const result = await jiraIssues(described, { ...SETTINGS, site: SITE }).get('QUEST-7')

    expect(result).toMatchObject({
      ok: true,
      value: { summary: 'Orders of 10 or more.\nGet 10% off.', description: 'Orders of 10 or more.\nGet 10% off.', descriptionFormat: 'text' },
    })
  })

  test('a description the server wrote as HTML is read as its text', async () => {
    const described = async (_: string, tool: string): Promise<McpToolResult> =>
      tool === 'getJiraIssue'
        ? answered(issue({ description: '<p>Orders of <strong>10</strong> or more.</p><p>Get 10% off.</p>' }))
        : answered({})
    const result = await jiraIssues(described, { ...SETTINGS, site: SITE }).get('QUEST-7')

    expect(result).toMatchObject({ ok: true, value: { summary: 'Orders of 10 or more.\nGet 10% off.' } })
  })

  test('the status is the issue\'s, and its triage labels are tags', async () => {
    const [quest] = await listed([issue({ labels: ['needs-info', 'frontend'] })])

    expect(quest).toMatchObject({ status: 'To Do', tags: ['needs-info'] })
  })

  test('a JQL error is misconfigured, in Jira’s own words', async () => {
    const result = await jiraIssues(
      async () =>
        answered(
          {
            error: true,
            message: "JQL validation failed: The value 'NOPE' does not exist for the field 'project'.",
            statusCode: 400,
          },
          true,
        ),
      { ...SETTINGS, site: SITE },
    ).list()

    expect(result).toEqual({
      ok: false,
      problem: {
        kind: 'misconfigured',
        message: "JQL validation failed: The value 'NOPE' does not exist for the field 'project'.",
      },
    })
  })

  test('an answer that is not JSON is unreachable, not a crash', async () => {
    const result = await jiraIssues(
      async () => ({ content: [{ type: 'text', text: 'not json' }], isError: false }),
      { ...SETTINGS, site: SITE },
    ).list()

    expect(result).toMatchObject({ ok: false, problem: { kind: 'unreachable' } })
  })
})
