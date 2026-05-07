/**
 * Lists available scripts for the cron job file picker.
 *
 * GET /api/cron-scripts?profile=nico
 * → { scripts: ["memory-watchdog.sh", "disk-check.py", ...] }
 */
import { createFileRoute } from '@tanstack/react-router'
import { isAuthenticated } from '../../server/auth-middleware'
import { listScripts as listProfileScripts } from '../../server/profile-cron'
import { isProfileValid } from '../../server/profile-validation'

export const Route = createFileRoute('/api/cron-scripts')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        if (!isAuthenticated(request)) {
          return new Response(JSON.stringify({ error: 'Unauthorized' }), {
            status: 401,
          })
        }
        try {
          const profile = new URL(request.url).searchParams.get('profile')?.trim() || 'default'
          if (!isProfileValid(profile)) {
            return new Response(JSON.stringify({ error: 'Invalid profile name' }), {
              status: 400,
              headers: { 'Content-Type': 'application/json' },
            })
          }
          const scripts = listProfileScripts(profile)
          return new Response(JSON.stringify({ scripts }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (err) {
          return new Response(JSON.stringify({
            error: `Failed to list scripts: ${err instanceof Error ? err.message : String(err)}`,
          }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
          })
        }
      },
    },
  },
})
