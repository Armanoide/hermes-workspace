/**
 * Profile-aware cron job storage.
 *
 * Reads and writes `jobs.json` from any Hermes profile's cron directory.
 * This bypasses the Hermes dashboard API (which only targets the active
 * profile) and operates directly on the filesystem.
 *
 * Layout:
 *   Main Agent:  HERMES_HOME/cron/jobs.json
 *   Custom:      HERMES_HOME/profiles/<name>/cron/jobs.json
 */

import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { getHermesRoot, getProfileHermesHome } from './claude-paths'
import { validateProfileName } from './profile-validation'

// ---------------------------------------------------------------------------
// Path resolution
// ---------------------------------------------------------------------------

/**
 * Resolve the cron directory for a given profile.
 * "default" → HERMES_HOME/cron/
 * "nico"    → HERMES_HOME/profiles/nico/cron/
 */
function getCronDir(profileName: string): string {
  if (profileName === 'default') {
    return path.join(getHermesRoot(), 'cron')
  }
  return path.join(getProfileHermesHome(validateProfileName(profileName)), 'cron')
}

function getScriptsDir(profileName: string): string {
  if (profileName === 'default') {
    return path.join(getHermesRoot(), 'scripts')
  }
  return path.join(getProfileHermesHome(validateProfileName(profileName)), 'scripts')
}

function getJobsFilePath(profileName: string): string {
  return path.join(getCronDir(profileName), 'jobs.json')
}

// ---------------------------------------------------------------------------
// Atomic file I/O
// ---------------------------------------------------------------------------

function readJsonFile(filePath: string): Record<string, unknown> {
  if (!fs.existsSync(filePath)) return {}
  try {
    const raw = fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed
      : {}
  } catch (err) {
    console.error(`[profile-cron] Failed to parse ${filePath}:`, err)
    return {}
  }
}

function writeJsonFileAtomic(filePath: string, data: unknown): void {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  const tmpPath = `${filePath}.tmp.${crypto.randomBytes(4).toString('hex')}`
  try {
    fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf-8')
    fs.renameSync(tmpPath, filePath)
  } catch (err) {
    // Clean up temp file on failure
    try {
      fs.unlinkSync(tmpPath)
    } catch {
      // ignore
    }
    throw err
  }
}

// ---------------------------------------------------------------------------
// Jobs CRUD
// ---------------------------------------------------------------------------

export type CronJobRecord = Record<string, unknown>

export function readJobs(profileName: string): Array<CronJobRecord> {
  const doc = readJsonFile(getJobsFilePath(profileName))
  const jobs = doc.jobs
  if (Array.isArray(jobs)) return jobs as Array<CronJobRecord>
  return []
}

function writeJobs(profileName: string, jobs: Array<CronJobRecord>): void {
  const doc = { jobs, updated_at: new Date().toISOString() }
  writeJsonFileAtomic(getJobsFilePath(profileName), doc)
}

function generateJobId(): string {
  return crypto.randomBytes(6).toString('hex')
}

export function createJob(
  profileName: string,
  input: {
    name: string
    schedule: string
    prompt?: string
    deliver?: Array<string>
    skills?: Array<string>
    repeat?: number
    no_agent?: boolean
    script?: string
  },
): CronJobRecord {
  // Validate inputs
  if (!input.name || input.name.length > 200) {
    throw new Error('Name is required and must be ≤ 200 characters')
  }
  if (!input.schedule || input.schedule.length > 200) {
    throw new Error('Schedule is required and must be ≤ 200 characters')
  }
  if (input.script && !/^[a-zA-Z0-9_.-]+$/.test(input.script)) {
    throw new Error('Script name contains invalid characters')
  }

  const jobs = readJobs(profileName)
  const id = generateJobId()

  const job: CronJobRecord = {
    id,
    name: input.name,
    prompt: input.no_agent ? '' : (input.prompt ?? ''),
    schedule: {
      kind: 'interval',
      display: input.schedule,
    },
    schedule_display: input.schedule,
    enabled: true,
    state: 'scheduled',
    deliver: input.deliver?.[0] ?? 'local',
    origin: null,
    created_at: new Date().toISOString(),
    next_run_at: null,
    last_run_at: null,
    last_status: null,
    last_error: null,
    last_delivery_error: null,
    paused_at: null,
    paused_reason: null,
    repeat: {
      times: input.repeat ?? null,
      completed: 0,
    },
  }

  if (input.skills && input.skills.length > 0) {
    job.skills = input.skills
    job.skill = input.skills[0]
  }

  if (input.no_agent) {
    job.no_agent = true
    job.script = input.script ?? null
    job.prompt = ''
  }

  jobs.push(job)
  writeJobs(profileName, jobs)
  return job
}

function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result = { ...target }
  for (const [key, value] of Object.entries(source)) {
    if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === 'object' &&
      !Array.isArray(result[key])
    ) {
      result[key] = deepMerge(
        result[key] as Record<string, unknown>,
        value as Record<string, unknown>,
      )
    } else {
      result[key] = value
    }
  }
  return result
}

export function updateJob(
  profileName: string,
  jobId: string,
  updates: Record<string, unknown>,
): CronJobRecord | null {
  const jobs = readJobs(profileName)
  const idx = jobs.findIndex((j) => j.id === jobId)
  if (idx === -1) return null

  const existing = jobs[idx]
  const updated = deepMerge(existing, updates)

  // Preserve immutable fields
  updated.id = existing.id
  updated.created_at = existing.created_at

  jobs[idx] = updated
  writeJobs(profileName, jobs)
  return updated
}

export function deleteJob(profileName: string, jobId: string): boolean {
  const jobs = readJobs(profileName)
  const filtered = jobs.filter((j) => j.id !== jobId)
  if (filtered.length === jobs.length) return false
  writeJobs(profileName, filtered)
  return true
}

export function pauseJob(
  profileName: string,
  jobId: string,
): CronJobRecord | null {
  return updateJob(profileName, jobId, {
    enabled: false,
    state: 'paused',
    paused_at: new Date().toISOString(),
  })
}

export function resumeJob(
  profileName: string,
  jobId: string,
): CronJobRecord | null {
  return updateJob(profileName, jobId, {
    enabled: true,
    state: 'scheduled',
    paused_at: null,
    paused_reason: null,
  })
}

export function triggerJob(
  profileName: string,
  jobId: string,
): CronJobRecord | null {
  return updateJob(profileName, jobId, {
    state: 'triggered',
  })
}

/**
 * Move a job from one profile to another.
 * Creates a new job in the target profile with a new ID, then deletes from source.
 * If the delete fails, the job exists in both profiles (safe duplicate over silent loss).
 */
export function moveJob(
  fromProfile: string,
  toProfile: string,
  jobId: string,
): CronJobRecord | null {
  if (fromProfile === toProfile) return null

  const sourceJobs = readJobs(fromProfile)
  const job = sourceJobs.find((j) => j.id === jobId)
  if (!job) return null

  // Create a new job in target profile with a fresh ID
  const targetJobs = readJobs(toProfile)
  const movedJob: CronJobRecord = {
    ...job,
    id: generateJobId(),
    created_at: new Date().toISOString(),
  }
  targetJobs.push(movedJob)

  try {
    writeJobs(toProfile, targetJobs)
    writeJobs(fromProfile, sourceJobs.filter((j) => j.id !== jobId))
  } catch (err) {
    // Rollback: remove from target if source delete fails
    try {
      writeJobs(toProfile, targetJobs.filter((j) => j.id !== movedJob.id))
    } catch {
      // If rollback also fails, log and let caller handle
      console.error('[profile-cron] Move rollback failed:', err)
    }
    throw err
  }

  return movedJob
}

// ---------------------------------------------------------------------------
// Scripts listing
// ---------------------------------------------------------------------------

const SCRIPT_EXTENSIONS = new Set([
  '.sh', '.bash', '.py', '.js', '.ts', '.rb', '.pl',
])

export function listScripts(profileName: string): Array<string> {
  const scriptsDir = getScriptsDir(profileName)
  if (!fs.existsSync(scriptsDir)) return []

  try {
    const entries = fs.readdirSync(scriptsDir, { withFileTypes: true })
    return entries
      .filter((e) => {
        if (!e.isFile()) return false
        const ext = path.extname(e.name).toLowerCase()
        return SCRIPT_EXTENSIONS.has(ext)
      })
      .map((e) => e.name)
      .sort()
  } catch {
    return []
  }
}
