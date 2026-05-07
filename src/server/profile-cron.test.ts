import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import path from 'node:path'

const { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync, readdirSync } = vi.hoisted(() => ({
  existsSync: vi.fn().mockReturnValue(false),
  readFileSync: vi.fn().mockReturnValue('{}'),
  writeFileSync: vi.fn().mockImplementation(() => {}),
  mkdirSync: vi.fn().mockImplementation(() => {}),
  renameSync: vi.fn().mockImplementation(() => {}),
  unlinkSync: vi.fn().mockImplementation(() => {}),
  readdirSync: vi.fn().mockReturnValue([]),
}))

vi.mock('node:fs', () => ({
  default: { existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, unlinkSync, readdirSync },
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  readdirSync,
}))

const mockRandomBytes = vi.hoisted(() =>
  vi.fn().mockImplementation((n: number) => {
    const buf = Buffer.alloc(n)
    for (let i = 0; i < n; i++) buf[i] = i
    return buf
  }),
)

vi.mock('node:crypto', () => ({
  default: { randomBytes: mockRandomBytes },
  randomBytes: mockRandomBytes,
}))

const { homedir } = vi.hoisted(() => ({
  homedir: vi.fn().mockReturnValue('/home/testuser'),
}))

vi.mock('node:os', () => ({
  default: { homedir },
  homedir,
}))

const ROOT = path.join('/home/testuser', '.hermes')

function setupFs() {
  existsSync.mockImplementation((p: string) => p === ROOT)
}

beforeEach(() => {
  existsSync.mockReset()
  readFileSync.mockReset()
  writeFileSync.mockReset()
  mkdirSync.mockReset()
  renameSync.mockReset()
  unlinkSync.mockReset()
  readdirSync.mockReset()
  mockRandomBytes.mockReset()
  process.env.HERMES_HOME = ROOT
  delete process.env.CLAUDE_HOME
  setupFs()
  mockRandomBytes.mockImplementation((n: number) => {
    const buf = Buffer.alloc(n)
    for (let i = 0; i < n; i++) buf[i] = i
    return buf
  })
})

async function loadMod() {
  return import('./profile-cron')
}

describe('profile-cron', () => {
  describe('readJobs', () => {
    it('returns [] for missing file', async () => {
      const mod = await loadMod()
      expect(mod.readJobs('default')).toEqual([])
    })

    it('returns [] for empty JSON object', async () => {
      const jobsPath = path.join(ROOT, 'cron', 'jobs.json')
      existsSync.mockImplementation((p: string) => p === ROOT || p === jobsPath)
      readFileSync.mockReturnValue('{}')
      const mod = await loadMod()
      expect(mod.readJobs('default')).toEqual([])
    })

    it('returns [] for malformed JSON', async () => {
      const jobsPath = path.join(ROOT, 'cron', 'jobs.json')
      existsSync.mockImplementation((p: string) => p === ROOT || p === jobsPath)
      readFileSync.mockReturnValue('not json at all')
      const mod = await loadMod()
      expect(mod.readJobs('default')).toEqual([])
    })

    it('returns array from valid { jobs: [...] }', async () => {
      const jobsPath = path.join(ROOT, 'cron', 'jobs.json')
      existsSync.mockImplementation((p: string) => p === ROOT || p === jobsPath)
      readFileSync.mockReturnValue(JSON.stringify({ jobs: [{ id: 'a', name: 'test' }] }))
      const mod = await loadMod()
      const jobs = mod.readJobs('default')
      expect(jobs).toHaveLength(1)
      expect(jobs[0]).toEqual({ id: 'a', name: 'test' })
    })
  })

  describe('createJob', () => {
    it('creates a job with all standard fields', async () => {
      const jobsPath = path.join(ROOT, 'cron', 'jobs.json')
      existsSync.mockImplementation((p: string) => p === ROOT || p === jobsPath)
      readFileSync.mockReturnValue('{}')
      const mod = await loadMod()
      const job = mod.createJob('default', {
        name: 'Daily summary',
        schedule: '0 9 * * *',
        prompt: 'Summarize the day',
      })
      expect(job.id).toBe('000102030405')
      expect(job.name).toBe('Daily summary')
      expect(job.prompt).toBe('Summarize the day')
      expect(job.enabled).toBe(true)
      expect(job.state).toBe('scheduled')
      expect(job.deliver).toBe('local')
      expect(writeFileSync).toHaveBeenCalled()
    })

    it('creates a no_agent job with script field', async () => {
      const jobsPath = path.join(ROOT, 'cron', 'jobs.json')
      existsSync.mockImplementation((p: string) => p === ROOT || p === jobsPath)
      readFileSync.mockReturnValue('{}')
      const mod = await loadMod()
      const job = mod.createJob('default', {
        name: 'Disk check',
        schedule: 'every 1h',
        no_agent: true,
        script: 'disk-check.sh',
      })
      expect(job.no_agent).toBe(true)
      expect(job.script).toBe('disk-check.sh')
      expect(job.prompt).toBe('')
    })

    it('sets skills and skill[0] when skills provided', async () => {
      const jobsPath = path.join(ROOT, 'cron', 'jobs.json')
      existsSync.mockImplementation((p: string) => p === ROOT || p === jobsPath)
      readFileSync.mockReturnValue('{}')
      const mod = await loadMod()
      const job = mod.createJob('default', {
        name: 'Research',
        schedule: 'daily',
        skills: ['research', 'writing'],
      })
      expect(job.skills).toEqual(['research', 'writing'])
      expect(job.skill).toBe('research')
    })

    it('throws on empty name', async () => {
      const jobsPath = path.join(ROOT, 'cron', 'jobs.json')
      existsSync.mockImplementation((p: string) => p === ROOT || p === jobsPath)
      readFileSync.mockReturnValue('{}')
      const mod = await loadMod()
      expect(() => mod.createJob('default', { name: '', schedule: 'daily' })).toThrow(
        'Name is required',
      )
    })

    it('throws on name > 200 characters', async () => {
      const jobsPath = path.join(ROOT, 'cron', 'jobs.json')
      existsSync.mockImplementation((p: string) => p === ROOT || p === jobsPath)
      readFileSync.mockReturnValue('{}')
      const mod = await loadMod()
      expect(() =>
        mod.createJob('default', { name: 'a'.repeat(201), schedule: 'daily' }),
      ).toThrow('200 characters')
    })

    it('throws on invalid script filename', async () => {
      const jobsPath = path.join(ROOT, 'cron', 'jobs.json')
      existsSync.mockImplementation((p: string) => p === ROOT || p === jobsPath)
      readFileSync.mockReturnValue('{}')
      const mod = await loadMod()
      expect(() =>
        mod.createJob('default', {
          name: 'evil',
          schedule: 'daily',
          script: '../../etc/passwd',
        }),
      ).toThrow('invalid characters')
    })
  })

  describe('updateJob', () => {
    it('applies partial update via deepMerge', async () => {
      const jobsPath = path.join(ROOT, 'cron', 'jobs.json')
      existsSync.mockImplementation((p: string) => p === ROOT || p === jobsPath)
      readFileSync.mockReturnValue(
        JSON.stringify({
          jobs: [{ id: 'a', name: 'old', created_at: '2026-01-01', schedule: { kind: 'interval' } }],
        }),
      )
      const mod = await loadMod()
      const updated = mod.updateJob('default', 'a', { name: 'new', schedule: { display: 'daily' } })
      expect(updated).not.toBeNull()
      expect(updated!.name).toBe('new')
      // deepMerge preserves existing nested keys
      expect(updated!.schedule).toEqual({ kind: 'interval', display: 'daily' })
      // immutable fields preserved
      expect(updated!.id).toBe('a')
      expect(updated!.created_at).toBe('2026-01-01')
    })

    it('returns null for missing job', async () => {
      const jobsPath = path.join(ROOT, 'cron', 'jobs.json')
      existsSync.mockImplementation((p: string) => p === ROOT || p === jobsPath)
      readFileSync.mockReturnValue(JSON.stringify({ jobs: [{ id: 'a' }] }))
      const mod = await loadMod()
      expect(mod.updateJob('default', 'missing', { name: 'x' })).toBeNull()
    })
  })

  describe('deleteJob', () => {
    it('removes job and returns true', async () => {
      const jobsPath = path.join(ROOT, 'cron', 'jobs.json')
      existsSync.mockImplementation((p: string) => p === ROOT || p === jobsPath)
      readFileSync.mockReturnValue(
        JSON.stringify({ jobs: [{ id: 'a' }, { id: 'b' }] }),
      )
      const mod = await loadMod()
      expect(mod.deleteJob('default', 'a')).toBe(true)
    })

    it('returns false for missing job', async () => {
      const jobsPath = path.join(ROOT, 'cron', 'jobs.json')
      existsSync.mockImplementation((p: string) => p === ROOT || p === jobsPath)
      readFileSync.mockReturnValue(JSON.stringify({ jobs: [{ id: 'a' }] }))
      const mod = await loadMod()
      expect(mod.deleteJob('default', 'missing')).toBe(false)
    })
  })

  describe('pauseJob / resumeJob / triggerJob', () => {
    it('pauseJob sets correct state', async () => {
      const jobsPath = path.join(ROOT, 'cron', 'jobs.json')
      existsSync.mockImplementation((p: string) => p === ROOT || p === jobsPath)
      readFileSync.mockReturnValue(
        JSON.stringify({ jobs: [{ id: 'a', enabled: true, state: 'scheduled' }] }),
      )
      const mod = await loadMod()
      const result = mod.pauseJob('default', 'a')
      expect(result).not.toBeNull()
      expect(result!.enabled).toBe(false)
      expect(result!.state).toBe('paused')
      expect(result!.paused_at).toBeDefined()
    })

    it('resumeJob sets correct state', async () => {
      const jobsPath = path.join(ROOT, 'cron', 'jobs.json')
      existsSync.mockImplementation((p: string) => p === ROOT || p === jobsPath)
      readFileSync.mockReturnValue(
        JSON.stringify({ jobs: [{ id: 'a', enabled: false, state: 'paused' }] }),
      )
      const mod = await loadMod()
      const result = mod.resumeJob('default', 'a')
      expect(result).not.toBeNull()
      expect(result!.enabled).toBe(true)
      expect(result!.state).toBe('scheduled')
      expect(result!.paused_at).toBeNull()
    })

    it('triggerJob sets state to triggered', async () => {
      const jobsPath = path.join(ROOT, 'cron', 'jobs.json')
      existsSync.mockImplementation((p: string) => p === ROOT || p === jobsPath)
      readFileSync.mockReturnValue(
        JSON.stringify({ jobs: [{ id: 'a', state: 'scheduled' }] }),
      )
      const mod = await loadMod()
      const result = mod.triggerJob('default', 'a')
      expect(result).not.toBeNull()
      expect(result!.state).toBe('triggered')
    })

    it('returns null for missing job', async () => {
      const jobsPath = path.join(ROOT, 'cron', 'jobs.json')
      existsSync.mockImplementation((p: string) => p === ROOT || p === jobsPath)
      readFileSync.mockReturnValue(JSON.stringify({ jobs: [] }))
      const mod = await loadMod()
      expect(mod.pauseJob('default', 'x')).toBeNull()
      expect(mod.resumeJob('default', 'x')).toBeNull()
      expect(mod.triggerJob('default', 'x')).toBeNull()
    })
  })

  describe('moveJob', () => {
    it('creates in target with new id, removes from source', async () => {
      const srcPath = path.join(ROOT, 'cron', 'jobs.json')
      const dstPath = path.join(ROOT, 'profiles', 'beta', 'cron', 'jobs.json')
      existsSync.mockImplementation(
        (p: string) => p === ROOT || p === srcPath || p === dstPath,
      )
      readFileSync.mockImplementation((p: string) => {
        if (p === srcPath) return JSON.stringify({ jobs: [{ id: 'a', name: 'mover' }] })
        return '{}'
      })
      const mod = await loadMod()
      const moved = mod.moveJob('default', 'beta', 'a')
      expect(moved).not.toBeNull()
      expect(moved!.id).toBe('000102030405') // new id from mock
      expect(moved!.id).not.toBe('a')
    })

    it('returns null when from === to', async () => {
      const mod = await loadMod()
      expect(mod.moveJob('default', 'default', 'a')).toBeNull()
    })

    it('returns null for missing source job', async () => {
      const srcPath = path.join(ROOT, 'cron', 'jobs.json')
      existsSync.mockImplementation((p: string) => p === ROOT || p === srcPath)
      readFileSync.mockReturnValue(JSON.stringify({ jobs: [] }))
      const mod = await loadMod()
      expect(mod.moveJob('default', 'beta', 'missing')).toBeNull()
    })

    it('rolls back target when source delete fails', async () => {
      const srcPath = path.join(ROOT, 'cron', 'jobs.json')
      const dstPath = path.join(ROOT, 'profiles', 'beta', 'cron', 'jobs.json')
      let writeCallCount = 0
      existsSync.mockImplementation(
        (p: string) => p === ROOT || p === srcPath || p === dstPath,
      )
      readFileSync.mockImplementation((p: string) => {
        if (p === srcPath) return JSON.stringify({ jobs: [{ id: 'a', name: 'mover' }] })
        return '{}'
      })
      writeFileSync.mockImplementation(() => {
        writeCallCount++
        // Fail on 2nd write (source delete)
        if (writeCallCount === 2) throw new Error('disk full')
      })
      const mod = await loadMod()
      expect(() => mod.moveJob('default', 'beta', 'a')).toThrow('disk full')
      // Should have attempted 3 writes: target create, source delete (failed), target rollback
      expect(writeCallCount).toBe(3)
    })
  })

  describe('listScripts', () => {
    it('returns [] for missing directory', async () => {
      const mod = await loadMod()
      expect(mod.listScripts('default')).toEqual([])
    })

    it('lists script files by extension', async () => {
      const scriptsDir = path.join(ROOT, 'scripts')
      existsSync.mockImplementation((p: string) => p === ROOT || p === scriptsDir)
      readdirSync.mockReturnValue([
        { name: 'backup.sh', isFile: () => true } as never,
        { name: 'check.py', isFile: () => true } as never,
        { name: 'task.js', isFile: () => true } as never,
        { name: 'readme.md', isFile: () => true } as never,
        { name: 'subdir', isFile: () => false } as never,
      ])
      const mod = await loadMod()
      const scripts = mod.listScripts('default')
      expect(scripts).toEqual(['backup.sh', 'check.py', 'task.js'])
    })

    it('returns [] on readdir error', async () => {
      const scriptsDir = path.join(ROOT, 'scripts')
      existsSync.mockImplementation((p: string) => p === ROOT || p === scriptsDir)
      readdirSync.mockImplementation(() => {
        throw new Error('permission denied')
      })
      const mod = await loadMod()
      expect(mod.listScripts('default')).toEqual([])
    })
  })
})
