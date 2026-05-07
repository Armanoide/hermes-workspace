import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { isAuthenticated } from '../../server/auth-middleware'
import { Route as JobsRoute } from './claude-jobs'
import { Route as JobIdRoute } from './claude-jobs.$jobId'
import { Route as CronScriptsRoute } from './cron-scripts'

const {
  mockReadJobs,
  mockCreateJob,
  mockUpdateJob,
  mockDeleteJob,
  mockPauseJob,
  mockResumeJob,
  mockTriggerJob,
  mockMoveJob,
  mockListScripts,
} = vi.hoisted(() => ({
  mockReadJobs: vi.fn(),
  mockCreateJob: vi.fn(),
  mockUpdateJob: vi.fn(),
  mockDeleteJob: vi.fn(),
  mockPauseJob: vi.fn(),
  mockResumeJob: vi.fn(),
  mockTriggerJob: vi.fn(),
  mockMoveJob: vi.fn(),
  mockListScripts: vi.fn(),
}))

vi.mock('../../server/auth-middleware', () => ({
  isAuthenticated: vi.fn(),
}))

vi.mock('../../server/profile-cron', () => ({
  readJobs: mockReadJobs,
  createJob: mockCreateJob,
  updateJob: mockUpdateJob,
  deleteJob: mockDeleteJob,
  pauseJob: mockPauseJob,
  resumeJob: mockResumeJob,
  triggerJob: mockTriggerJob,
  moveJob: mockMoveJob,
  listScripts: mockListScripts,
}))

vi.mock('../../server/gateway-capabilities', () => ({
  BEARER_TOKEN: undefined,
  CLAUDE_API: '/api/claude',
  CLAUDE_UPGRADE_INSTRUCTIONS: 'Upgrade.',
  dashboardFetch: vi.fn(),
  ensureGatewayProbed: vi.fn().mockResolvedValue({ jobs: true, dashboard: { available: false } }),
}))

type Handlers = {
  GET?: (ctx: { request: Request; params?: Record<string, string> }) => Promise<Response>
  POST?: (ctx: { request: Request; params?: Record<string, string> }) => Promise<Response>
  PATCH?: (ctx: { request: Request; params?: Record<string, string> }) => Promise<Response>
  DELETE?: (ctx: { request: Request; params?: Record<string, string> }) => Promise<Response>
}

const jobsHandlers = (JobsRoute as unknown as { options: { server: { handlers: Handlers } } }).options.server.handlers
const jobIdHandlers = (JobIdRoute as unknown as { options: { server: { handlers: Handlers } } }).options.server.handlers
const cronScriptsHandlers = (CronScriptsRoute as unknown as { options: { server: { handlers: Handlers } } }).options.server.handlers

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /api/claude-jobs?profile=', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(false)
    const req = new Request('http://localhost/api/claude-jobs?profile=beta')
    const res = await jobsHandlers.GET!({ request: req })
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid profile name', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    const req = new Request('http://localhost/api/claude-jobs?profile=../../etc')
    const res = await jobsHandlers.GET!({ request: req })
    expect(res.status).toBe(400)
    const body = await res.json()
    expect(body.error).toMatch(/invalid/i)
  })

  it('returns 200 with jobs for valid profile', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    mockReadJobs.mockReturnValue([{ id: 'a', name: 'test' }])
    const req = new Request('http://localhost/api/claude-jobs?profile=beta')
    const res = await jobsHandlers.GET!({ request: req })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.jobs).toEqual([{ id: 'a', name: 'test' }])
  })

  it('returns 500 when readJobs throws', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    mockReadJobs.mockImplementation(() => { throw new Error('disk error') })
    const req = new Request('http://localhost/api/claude-jobs?profile=beta')
    const res = await jobsHandlers.GET!({ request: req })
    expect(res.status).toBe(500)
  })
})

describe('POST /api/claude-jobs?profile=', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(false)
    const req = new Request('http://localhost/api/claude-jobs?profile=beta', { method: 'POST' })
    const res = await jobsHandlers.POST!({ request: req })
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid profile name', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    const req = new Request('http://localhost/api/claude-jobs?profile=../evil', { method: 'POST' })
    const res = await jobsHandlers.POST!({ request: req })
    expect(res.status).toBe(400)
  })

  it('returns 200 with created job', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    mockCreateJob.mockReturnValue({ id: 'new', name: 'Daily' })
    const req = new Request('http://localhost/api/claude-jobs?profile=beta', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Daily', schedule: 'daily' }),
    })
    const res = await jobsHandlers.POST!({ request: req })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.job).toEqual({ id: 'new', name: 'Daily' })
  })
})

describe('PATCH /api/claude-jobs/:id?profile=', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(false)
    const req = new Request('http://localhost/api/claude-jobs/j1?profile=beta', { method: 'PATCH' })
    const res = await jobIdHandlers.PATCH!({ request: req, params: { jobId: 'j1' } })
    expect(res.status).toBe(401)
  })

  it('updates a job', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    mockUpdateJob.mockReturnValue({ id: 'j1', name: 'updated' })
    const req = new Request('http://localhost/api/claude-jobs/j1?profile=beta', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'updated' }),
    })
    const res = await jobIdHandlers.PATCH!({ request: req, params: { jobId: 'j1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.job.name).toBe('updated')
  })

  it('returns 404 for missing job', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    mockUpdateJob.mockReturnValue(null)
    const req = new Request('http://localhost/api/claude-jobs/missing?profile=beta', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x' }),
    })
    const res = await jobIdHandlers.PATCH!({ request: req, params: { jobId: 'missing' } })
    expect(res.status).toBe(404)
  })

  it('moves a job to another profile', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    mockMoveJob.mockReturnValue({ id: 'new-id', name: 'mover' })
    const req = new Request('http://localhost/api/claude-jobs/j1?profile=alpha', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ move_to_profile: 'beta' }),
    })
    const res = await jobIdHandlers.PATCH!({ request: req, params: { jobId: 'j1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.moved_to).toBe('beta')
  })

  it('rejects invalid move_to_profile with 500', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    const req = new Request('http://localhost/api/claude-jobs/j1?profile=alpha', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ move_to_profile: '../../evil' }),
    })
    const res = await jobIdHandlers.PATCH!({ request: req, params: { jobId: 'j1' } })
    expect(res.status).toBe(500)
  })
})

describe('DELETE /api/claude-jobs/:id?profile=', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(false)
    const req = new Request('http://localhost/api/claude-jobs/j1?profile=beta', { method: 'DELETE' })
    const res = await jobIdHandlers.DELETE!({ request: req, params: { jobId: 'j1' } })
    expect(res.status).toBe(401)
  })

  it('deletes a job', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    mockDeleteJob.mockReturnValue(true)
    const req = new Request('http://localhost/api/claude-jobs/j1?profile=beta', { method: 'DELETE' })
    const res = await jobIdHandlers.DELETE!({ request: req, params: { jobId: 'j1' } })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.ok).toBe(true)
  })

  it('returns 404 for missing job', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    mockDeleteJob.mockReturnValue(false)
    const req = new Request('http://localhost/api/claude-jobs/missing?profile=beta', { method: 'DELETE' })
    const res = await jobIdHandlers.DELETE!({ request: req, params: { jobId: 'missing' } })
    expect(res.status).toBe(404)
  })
})

describe('GET /api/cron-scripts?profile=', () => {
  it('returns 401 when unauthenticated', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(false)
    const req = new Request('http://localhost/api/cron-scripts?profile=beta')
    const res = await cronScriptsHandlers.GET!({ request: req })
    expect(res.status).toBe(401)
  })

  it('returns 400 for invalid profile name', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    const req = new Request('http://localhost/api/cron-scripts?profile=../evil')
    const res = await cronScriptsHandlers.GET!({ request: req })
    expect(res.status).toBe(400)
  })

  it('returns scripts for valid profile', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    mockListScripts.mockReturnValue(['backup.sh', 'check.py'])
    const req = new Request('http://localhost/api/cron-scripts?profile=beta')
    const res = await cronScriptsHandlers.GET!({ request: req })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.scripts).toEqual(['backup.sh', 'check.py'])
  })

  it('returns empty array for missing scripts dir', async () => {
    vi.mocked(isAuthenticated).mockReturnValue(true)
    mockListScripts.mockReturnValue([])
    const req = new Request('http://localhost/api/cron-scripts?profile=beta')
    const res = await cronScriptsHandlers.GET!({ request: req })
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.scripts).toEqual([])
  })
})
