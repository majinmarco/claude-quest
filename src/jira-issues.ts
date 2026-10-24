// The Jira adapter of the Quest Source: one Jira project's issues, read
// through the session's Atlassian MCP server with `$.mcp.call`, so the Player
// connects nothing beyond what Claude Code already has. Difficulty comes from
// the story points field (site-specific, so it is a setting), else a points or
// size label; recommended Stats from the issue type and labels.

import type { McpToolResult } from 'claude-code'

import {
  difficultyOf,
  LISTING_CAP,
  plainTextOf,
  pointsFromLabels,
  sizeFromLabels,
  statsOf,
  triageTagsOf,
} from './quest-source'
import type { QuestCard, QuestSource, QuestSourceProblem, Sourced, TicketDetails } from './quest-source'
import type { JiraSettings } from '../types'

export type { JiraSettings } from '../types'

/** Calls one MCP server's tool, as `$.mcp.call` does. */
export type CallTool = (
  server: string,
  tool: string,
  args: Record<string, unknown>,
) => Promise<McpToolResult>

/** The Atlassian MCP server as claude.ai's Atlassian connector names it. */
export const DEFAULT_SERVER = 'claude.ai Atlassian MCP'

/** The most issues one listing reads, as for GitHub Issues. */
const LIMIT = LISTING_CAP
/** The most the search tool returns a page. */
const PAGE = 100

/** An issue as searchJiraIssuesUsingJql and getJiraIssue write it. */
type JiraIssue = {
  key: string
  webUrl?: string
  fields?: {
    summary?: string
    labels?: string[]
    issuetype?: { name?: string; subtask?: boolean }
    status?: { name?: string }
    /** The issue's parent: its epic, or for a subtask its story. */
    parent?: { key?: unknown; fields?: { summary?: unknown } }
    /** Markdown or HTML (the server's default), or Atlassian Document Format. */
    description?: unknown
    /** Custom fields by their label on the site: the server's mapping. */
    customFields?: Record<string, { id?: string; value?: unknown }>
    [field: string]: unknown
  }
}

const isIssue = (value: unknown): value is JiraIssue =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as JiraIssue).key === 'string' &&
  typeof (value as JiraIssue).fields?.summary === 'string'

const asNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined

/**
 * The issue's story points: the field set, else a points label. The server
 * maps custom fields under their label on the site, with their id beside the
 * value; a raw `customfield_*` key is read too, should it answer in that shape.
 */
const pointsOf = (issue: JiraIssue, field: string | undefined): number | undefined => {
  const fromField =
    field === undefined
      ? undefined
      : (Object.values(issue.fields?.customFields ?? {}).find(entry => entry.id === field)?.value ??
        issue.fields?.[field])

  return asNumber(fromField) ?? pointsFromLabels(issue.fields?.labels ?? [])
}

const asQuest = (issue: JiraIssue, field: string | undefined): QuestCard => {
  const labels = issue.fields?.labels ?? []
  const type = issue.fields?.issuetype?.name
  const tags = triageTagsOf(labels)
  const dungeon = dungeonOf(issue)

  return {
    ticket: issue.key,
    title: issue.fields?.summary ?? issue.key,
    status: issue.fields?.status?.name ?? 'open',
    difficulty: difficultyOf({ points: pointsOf(issue, field), size: sizeFromLabels(labels) }),
    recommendedStats: statsOf(type === undefined ? labels : [type, ...labels]),
    ...(issue.webUrl === undefined ? {} : { url: issue.webUrl }),
    ...(tags.length === 0 ? {} : { tags }),
    ...(dungeon === undefined ? {} : { dungeon }),
  }
}

/**
 * The issue's Dungeon: its parent, keyed by the parent's issue key and named
 * by its summary (the key when it has none). A subtask's parent is a story,
 * not an epic, so a subtask is in the Wilds. Classic "Epic Link" custom
 * fields are not read.
 */
const dungeonOf = (issue: JiraIssue): QuestCard['dungeon'] => {
  const parent = issue.fields?.parent
  if (typeof parent?.key !== 'string' || issue.fields?.issuetype?.subtask === true) {
    return undefined
  }
  const summary = parent.fields?.summary

  return { key: parent.key, name: typeof summary === 'string' && summary.trim() !== '' ? summary : parent.key }
}

const asDetails = (issue: JiraIssue, field: string | undefined): TicketDetails => {
  const summary = plainTextOf(issue.fields?.description)

  return { ...asQuest(issue, field), ...(summary === undefined ? {} : { summary }) }
}

/** What a call answered: its JSON, or why it failed and Jira's status code. */
type Answer =
  | { ok: true; value: unknown }
  | { ok: false; problem: QuestSourceProblem; statusCode?: number }

// Words a refused connection uses when it wants signing in. A guess at the
// rejection's wording: Claude Code's types do not say how $.mcp.call fails.
const NEEDS_AUTH = /auth|sign[ -]?in|log[ -]?in|unauthori[sz]ed|\b401\b/i

const unauthenticated = (server: string): QuestSourceProblem => ({
  kind: 'unauthenticated',
  message: `The Atlassian connection (${server}) is not signed in: authenticate it with /mcp.`,
})

const forbidden = (project: string): QuestSourceProblem => ({
  kind: 'forbidden',
  message: `Your Atlassian account can't see project ${project} (403): check questSource.project or ask for Browse permission.`,
})

/** The text blocks of a result, joined. */
const textOf = (result: McpToolResult): string =>
  result.content
    .map(block => (block.type === 'text' && typeof block.text === 'string' ? block.text : ''))
    .join('')

const parse = (text: string): unknown => {
  try {
    return JSON.parse(text) as unknown
  } catch {
    return undefined
  }
}

/**
 * Calls the server and reads its JSON; any failure is a problem, never a
 * throw. A call that rejects never reached the server: no such connection, or
 * one wanting sign-in. One answered with `isError` is Jira's refusal, in its
 * own words: `{ error, message, statusCode }` as the Atlassian MCP writes it.
 */
const callJira = async (
  call: CallTool,
  server: string,
  project: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<Answer> => {
  let result: McpToolResult
  try {
    result = await call(server, tool, args)
  } catch (error) {
    const said = error instanceof Error ? error.message : String(error)

    return {
      ok: false,
      problem: NEEDS_AUTH.test(said)
        ? unauthenticated(server)
        : {
            kind: 'missing',
            message: `The Atlassian connection (${server}) is not available: connect it with /mcp. (${said})`,
          },
    }
  }

  const text = textOf(result)
  const value = result.structuredContent ?? parse(text)

  if (result.isError) {
    const refusal = (typeof value === 'object' && value !== null ? value : {}) as {
      message?: unknown
      statusCode?: unknown
    }
    const statusCode = asNumber(refusal.statusCode)
    if (statusCode === 401) {
      return { ok: false, problem: unauthenticated(server), statusCode }
    }
    if (statusCode === 403) {
      return { ok: false, problem: forbidden(project), statusCode }
    }
    const message =
      typeof refusal.message === 'string' && refusal.message.length > 0
        ? refusal.message
        : text.trim() || `${tool} failed.`

    return {
      ok: false,
      // A query Jira refused (400): the project, the JQL or a field set wrong.
      problem: { kind: statusCode === 400 ? 'misconfigured' : 'unreachable', message },
      ...(statusCode === undefined ? {} : { statusCode }),
    }
  }

  return value === undefined
    ? {
        ok: false,
        problem: { kind: 'unreachable', message: `${tool} answered with something other than JSON.` },
      }
    : { ok: true, value }
}

/** The first site among the connection's resources that has Jira. */
const jiraSiteOf = (value: unknown): string | undefined => {
  const data = (value as { data?: { resources?: unknown } } | null)?.data
  const resources = Array.isArray(data?.resources) ? data.resources : []
  const site = resources.find(
    (resource: { cloudId?: unknown; products?: { id?: unknown }[] }) =>
      typeof resource?.cloudId === 'string' &&
      (resource.products === undefined || resource.products.some(product => product.id === 'jira')),
  ) as { cloudId: string } | undefined

  return site?.cloudId
}

/** A page of issues, in either shape the server writes: nodes or a list. */
const pageOf = (value: unknown): { issues: unknown[]; next?: string } => {
  const answer = (value ?? {}) as {
    issues?: unknown
    nextPageToken?: unknown
    isLast?: unknown
  }
  const issues = answer.issues as
    | { nodes?: unknown; pageInfo?: { hasNextPage?: unknown; endCursor?: unknown } }
    | unknown[]
    | undefined

  if (Array.isArray(issues)) {
    const next = answer.isLast !== true && typeof answer.nextPageToken === 'string'
      ? answer.nextPageToken
      : undefined

    return { issues, ...(next === undefined ? {} : { next }) }
  }

  const nodes = Array.isArray(issues?.nodes) ? issues.nodes : []
  const info = issues?.pageInfo
  const next = info?.hasNextPage === true && typeof info.endCursor === 'string'
    ? info.endCursor
    : undefined

  return { issues: nodes, ...(next === undefined ? {} : { next }) }
}

// `ABC-123`, or its browse URL: what /implement reads as a Jira issue.
const JIRA_REF = /^([A-Z][A-Z0-9_]+-\d+)$|^https?:\/\/\S*\/browse\/([A-Z][A-Z0-9_]+-\d+)\/?$/

/** The fields a listing asks for; the default view leaves custom ones out. */
const fieldsFor = (settings: JiraSettings): string[] => [
  'summary',
  'status',
  'labels',
  'issuetype',
  'parent',
  ...(settings.storyPointsField === undefined ? [] : [settings.storyPointsField]),
]

export const jiraIssues = (call: CallTool, settings: JiraSettings): QuestSource => {
  const server = settings.server ?? DEFAULT_SERVER
  const pointsField = settings.storyPointsField
  const fields = fieldsFor(settings)
  const jql =
    settings.jql ?? `project = "${settings.project}" AND statusCategory != Done ORDER BY created DESC`
  let knownSite = settings.site

  /**
   * The site every call names as its `cloudId` (a cloudId or the site's URL,
   * as the server takes either), looked up once when the settings name none.
   */
  const jiraSite = async (): Promise<Sourced<string>> => {
    if (knownSite !== undefined) {
      return { ok: true, value: knownSite }
    }

    const answered = await callJira(call, server, settings.project, 'getAccessibleAtlassianResources', {})
    if (!answered.ok) {
      return { ok: false, problem: answered.problem }
    }

    const found = jiraSiteOf(answered.value)
    if (found === undefined) {
      return {
        ok: false,
        problem: {
          kind: 'misconfigured',
          message: `The Atlassian connection (${server}) reaches no Jira site: set questSource.site to the site's URL, or connect an account that has Jira.`,
        },
      }
    }
    knownSite = found

    return { ok: true, value: found }
  }

  /** The issues a query finds, every page up to the cap, as cards. */
  const search = async (query: string): Promise<Sourced<QuestCard[]>> => {
    const site = await jiraSite()
    if (!site.ok) {
      return site
    }

    const quests: QuestCard[] = []
    let next: string | undefined
    do {
      const answered = await callJira(call, server, settings.project, 'searchJiraIssuesUsingJql', {
        cloudId: site.value,
        jql: query,
        fields,
        maxResults: PAGE,
        ...(next === undefined ? {} : { nextPageToken: next }),
      })
      if (!answered.ok) {
        return { ok: false, problem: answered.problem }
      }

      const page = pageOf(answered.value)
      quests.push(...page.issues.filter(isIssue).map(issue => asQuest(issue, pointsField)))
      next = page.next
    } while (next !== undefined && quests.length < LIMIT)

    return { ok: true, value: quests.slice(0, LIMIT) }
  }

  return {
    list: () => search(jql),

    // The project's done issues, whatever the open listing's JQL: a sprint
    // filter would hide the Dungeons' cleared Rooms.
    listClosed: () =>
      search(`project = "${settings.project}" AND statusCategory = Done ORDER BY updated DESC`),

    get: async ticket => {
      const ref = JIRA_REF.exec(ticket.trim())
      const key = ref?.[1] ?? ref?.[2]
      if (key === undefined) {
        return { ok: true, value: null }
      }

      const site = await jiraSite()
      if (!site.ok) {
        return site
      }

      const answered = await callJira(call, server, settings.project, 'getJiraIssue', {
        cloudId: site.value,
        issueIdOrKey: key,
        fields: [...fields, 'description'],
      })
      if (!answered.ok) {
        return answered.statusCode === 404
          ? { ok: true, value: null }
          : { ok: false, problem: answered.problem }
      }

      // The Atlassian MCP answers with a page of one (`issues.nodes`), as
      // seen on a real site in October 2026; a bare issue is read too.
      const issue = isIssue(answered.value) ? answered.value : pageOf(answered.value).issues[0]

      return { ok: true, value: isIssue(issue) ? asDetails(issue, pointsField) : null }
    },
  }
}
