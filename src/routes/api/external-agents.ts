import { json } from '@tanstack/react-start'
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '@/server/auth-middleware'
import {
  getAionCoreCompanionSnapshot,
  healthCheckExternalAgentRuntime,
} from '@/server/aioncore-companion'

export const Route = createFileRoute('/api/external-agents')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const snapshot = await getAionCoreCompanionSnapshot()
        return json({ ok: true, companion: snapshot })
      },
      POST: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return json({ ok: false, error: 'Unauthorized' }, { status: 401 })
        }

        const body = (await request.json().catch(() => ({}))) as {
          runtimeId?: unknown
        }
        if (typeof body.runtimeId !== 'string' || !body.runtimeId.trim()) {
          return json(
            { ok: false, error: 'runtimeId is required' },
            { status: 400 },
          )
        }

        try {
          const runtime = await healthCheckExternalAgentRuntime(body.runtimeId)
          return json({ ok: true, runtime })
        } catch (error) {
          return json(
            {
              ok: false,
              error:
                error instanceof Error
                  ? error.message
                  : 'Agent health check failed',
            },
            { status: 502 },
          )
        }
      },
    },
  },
})
