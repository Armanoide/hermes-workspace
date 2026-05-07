/**
 * Jobs API proxy — forwards to Hermes Agent FastAPI /api/jobs
 *
 * When `?profile=<name>` is specified, routes through the filesystem-based
 * profile-cron module instead of the Hermes API (which only targets the
 * active profile's gateway).
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import {
  BEARER_TOKEN,
  CLAUDE_API,
  CLAUDE_UPGRADE_INSTRUCTIONS,
  dashboardFetch,
  ensureGatewayProbed,
} from '../../server/gateway-capabilities'
import { createCapabilityUnavailablePayload } from '@/lib/feature-gates'
import { readJobs as readProfileJobs, createJob as createProfileJob } from '../../server/profile-cron'
import { isProfileValid } from '../../server/profile-validation'

function authHeaders(): Record<string, string> {
  return BEARER_TOKEN ? { Authorization: `Bearer ${BEARER_TOKEN}` } : {}
}

/**
 * Normalise the jobs response so callers always receive `{ jobs: [...] }`.
 *
 * Some Hermes gateway versions return a bare array instead of the expected
 * `{ jobs: [] }` envelope. This helper wraps bare arrays so the workspace UI
 * never has to special-case both shapes.
 */
async function jobsResponse(res: Response): Promise<Response> {
  const text = await res.text()
  if (!res.ok) {
    return new Response(text, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
  try {
    const data = JSON.parse(text) as unknown
    const normalized = Array.isArray(data) ? { jobs: data } : data
    return new Response(JSON.stringify(normalized), {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  } catch {
    return new Response(text, {
      status: res.status,
      headers: { 'Content-Type': 'application/json' },
    })
  }
}

export const Route = createFileRoute('/api/claude-jobs')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
        }

        // Profile-aware: read from filesystem
        const profile = new URL(request.url).searchParams.get('profile')?.trim()
        if (profile) {
          if (!isProfileValid(profile)) {
            return new Response(JSON.stringify({ error: 'Invalid profile name' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            })
          }
          try {
            return new Response(JSON.stringify({ jobs: readProfileJobs(profile) }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          } catch (err) {
            return new Response(JSON.stringify({ error: String(err) }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            })
          }
        }

        // Existing proxy path (unchanged)
        const capabilities = await ensureGatewayProbed()
        if (!capabilities.jobs) {
          return new Response(
            JSON.stringify({
              ...createCapabilityUnavailablePayload('jobs'),
              items: [],
              jobs: [],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          )
        }
        const url = new URL(request.url)
        const params = url.searchParams.toString()
        const res = capabilities.dashboard.available
          ? await dashboardFetch(`/api/cron/jobs${params ? `?${params}` : ''}`)
          : await fetch(`${CLAUDE_API}/api/jobs${params ? `?${params}` : ''}`, {
              headers: authHeaders(),
            })
        return jobsResponse(res)
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 })
        }

        // Profile-aware: write to filesystem
        const profile = new URL(request.url).searchParams.get('profile')?.trim()
        if (profile) {
          if (!isProfileValid(profile)) {
            return new Response(JSON.stringify({ error: 'Invalid profile name' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            })
          }
          try {
            const body = await request.json()
            const job = createProfileJob(profile, {
              name: body.name,
              schedule: body.schedule,
              prompt: body.prompt ?? body.input,
              deliver: body.deliver,
              skills: body.skills,
              repeat: body.repeat,
              no_agent: body.no_agent,
              script: body.script,
            })
            return new Response(JSON.stringify({ job }), {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            })
          } catch (err) {
            return new Response(JSON.stringify({ error: String(err) }), {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            })
          }
        }

        // Existing proxy path (unchanged)
        const capabilities = await ensureGatewayProbed()
        if (!capabilities.jobs) {
          return new Response(
            JSON.stringify({
              ...createCapabilityUnavailablePayload('jobs', {
                error: `Gateway does not support /api/jobs. ${CLAUDE_UPGRADE_INSTRUCTIONS}`,
              }),
            }),
            { status: 503, headers: { 'Content-Type': 'application/json' } },
          )
        }
        const body = await request.text()
        const res = capabilities.dashboard.available
          ? await dashboardFetch('/api/cron/jobs', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body,
            })
          : await fetch(`${CLAUDE_API}/api/jobs`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', ...authHeaders() },
              body,
            })
        return new Response(await res.text(), {
          status: res.status,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
