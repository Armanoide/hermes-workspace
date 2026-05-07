'use client'

import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AnimatePresence, motion } from 'motion/react'
import { HugeiconsIcon } from '@hugeicons/react'
import { Cancel01Icon } from '@hugeicons/core-free-icons'
import { fetchCronScripts } from '@/lib/jobs-api'
import { SCHEDULE_PRESETS, DELIVERY_OPTIONS } from '@/lib/job-constants'

type CreateJobDialogProps = {
  open: boolean
  isSubmitting?: boolean
  profile?: string
  onOpenChange: (open: boolean) => void
  onSubmit: (input: {
    name: string
    schedule: string
    prompt?: string
    deliver?: Array<string>
    skills?: Array<string>
    repeat?: number
    no_agent?: boolean
    script?: string
  }) => void | Promise<void>
}

function getInitialState() {
  return {
    name: '',
    schedule: 'every 30m',
    prompt: '',
    skillsInput: '',
    deliver: ['local'] as Array<string>,
    repeatMode: 'unlimited' as 'unlimited' | 'limited',
    repeatCount: '1',
    mode: 'agent' as 'agent' | 'script',
    script: '',
  }
}

export function CreateJobDialog({
  open,
  isSubmitting = false,
  profile = 'default',
  onOpenChange,
  onSubmit,
}: CreateJobDialogProps) {
  const [form, setForm] = useState(getInitialState)

  const scriptsQuery = useQuery({
    queryKey: ['cron-scripts', profile],
    queryFn: () => fetchCronScripts(profile),
    enabled: open && form.mode === 'script',
    staleTime: 30_000,
  })

  useEffect(() => {
    if (!open) {
      setForm(getInitialState())
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [open, onOpenChange])

  function toggleDelivery(target: string) {
    setForm((current) => {
      const nextDeliver = current.deliver.includes(target)
        ? current.deliver.filter((item) => item !== target)
        : [...current.deliver, target]

      return {
        ...current,
        deliver: nextDeliver,
      }
    })
  }

  function handleFormSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const skills = form.skillsInput
      .split(',')
      .map((skill) => skill.trim())
      .filter(Boolean)

    void onSubmit({
      name: form.name.trim(),
      schedule: form.schedule.trim(),
      prompt: form.mode === 'agent' ? form.prompt.trim() : undefined,
      deliver: form.deliver.length > 0 ? form.deliver : undefined,
      skills: skills.length > 0 ? Array.from(new Set(skills)) : undefined,
      repeat:
        form.repeatMode === 'limited'
          ? Math.max(1, Number.parseInt(form.repeatCount, 10) || 1)
          : undefined,
      no_agent: form.mode === 'script',
      script: form.mode === 'script' ? form.script : undefined,
    })
  }

  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          key="create-job-dialog"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              onOpenChange(false)
            }
          }}
        >
          <div
            className="absolute inset-0"
            style={{ background: 'rgba(0, 0, 0, 0.68)' }}
            onClick={() => onOpenChange(false)}
          />
          <motion.form
            initial={{ opacity: 0, scale: 0.96, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.98, y: 10 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            onSubmit={handleFormSubmit}
            className="relative z-10 flex max-h-[85vh] w-[min(720px,96vw)] flex-col overflow-hidden rounded-2xl border shadow-2xl"
            style={{
              background: 'var(--theme-card)',
              borderColor: 'var(--theme-border)',
              color: 'var(--theme-text)',
            }}
          >
            <div
              className="flex items-start justify-between gap-4 border-b px-5 py-4"
              style={{ borderColor: 'var(--theme-border)' }}
            >
              <div>
                <h2 className="text-lg font-semibold">Create Job</h2>
                <p
                  className="mt-1 text-sm"
                  style={{ color: 'var(--theme-muted)' }}
                >
                  Build a scheduled Hermes task with preset timing options.
                </p>
              </div>
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-lg p-2 transition-colors"
                style={{ color: 'var(--theme-muted)' }}
                aria-label="Close create job dialog"
              >
                <HugeiconsIcon icon={Cancel01Icon} size={18} />
              </button>
            </div>

            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              <section className="space-y-2">
                <label className="text-sm font-medium">Name</label>
                <input
                  value={form.name}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="Daily research summary"
                  required
                  className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-1"
                  style={{
                    background: 'var(--theme-input)',
                    borderColor: 'var(--theme-border)',
                    color: 'var(--theme-text)',
                    boxShadow: '0 0 0 0 transparent',
                  }}
                />
              </section>

              <section className="space-y-3">
                <div>
                  <h3 className="text-sm font-medium">Schedule</h3>
                  <p
                    className="mt-1 text-xs"
                    style={{ color: 'var(--theme-muted)' }}
                  >
                    Choose a preset or enter a custom schedule string below.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {SCHEDULE_PRESETS.map((preset) => {
                    const isActive = form.schedule === preset.value
                    return (
                      <button
                        key={preset.label}
                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            schedule: preset.value,
                          }))
                        }
                        className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
                        style={{
                          background: isActive
                            ? 'var(--theme-accent)'
                            : 'var(--theme-card)',
                          borderColor: isActive
                            ? 'var(--theme-accent)'
                            : 'var(--theme-border)',
                          color: isActive ? '#fff' : 'var(--theme-text)',
                        }}
                      >
                        {preset.label}
                      </button>
                    )
                  })}
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Custom schedule</label>
                  <input
                    value={form.schedule}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        schedule: event.target.value,
                      }))
                    }
                    placeholder="every 30m or 0 9 * * *"
                    required
                    className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-1"
                    style={{
                      background: 'var(--theme-input)',
                      borderColor: 'var(--theme-border)',
                      color: 'var(--theme-text)',
                    }}
                  />
                  <p
                    className="text-xs"
                    style={{ color: 'var(--theme-muted)' }}
                  >
                    Advanced users can enter cron expressions directly.
                  </p>
                </div>
              </section>

              {form.mode === 'agent' ? (
                <section className="space-y-2">
                  <label className="text-sm font-medium">Prompt</label>
                  <textarea
                    value={form.prompt}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        prompt: event.target.value,
                      }))
                    }
                    placeholder="What should Hermes Agent do?"
                    required
                    rows={5}
                    className="w-full resize-none rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-1"
                    style={{
                      background: 'var(--theme-input)',
                      borderColor: 'var(--theme-border)',
                      color: 'var(--theme-text)',
                    }}
                  />
                </section>
              ) : (
                <section className="space-y-2">
                  <label className="text-sm font-medium">Script</label>
                  <select
                    value={form.script}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        script: event.target.value,
                      }))
                    }
                    required
                    className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-1"
                    style={{
                      background: 'var(--theme-input)',
                      borderColor: 'var(--theme-border)',
                      color: 'var(--theme-text)',
                    }}
                  >
                    <option value="">Select a script...</option>
                    {scriptsQuery.data?.map((script) => (
                      <option key={script} value={script}>
                        {script}
                      </option>
                    ))}
                  </select>
                  <p
                    className="text-xs"
                    style={{ color: 'var(--theme-muted)' }}
                  >
                    Scripts must exist in the profile&apos;s scripts/ directory.
                    {scriptsQuery.isLoading && ' Loading...'}
                  </p>
                </section>
              )}

              <section className="space-y-4">
                <div>
                  <h3 className="text-sm font-medium">Options</h3>
                  <p
                    className="mt-1 text-xs"
                    style={{ color: 'var(--theme-muted)' }}
                  >
                    Optional routing and repeat controls.
                  </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Skills</label>
                  <input
                    value={form.skillsInput}
                    onChange={(event) =>
                      setForm((current) => ({
                        ...current,
                        skillsInput: event.target.value,
                      }))
                    }
                    placeholder="research, writing, synthesis"
                    className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-1"
                    style={{
                      background: 'var(--theme-input)',
                      borderColor: 'var(--theme-border)',
                      color: 'var(--theme-text)',
                    }}
                  />
                   <p
                     className="text-xs"
                     style={{ color: 'var(--theme-muted)' }}
                   >
                     Comma-separated for now.
                   </p>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Deliver to</label>
                  <div className="flex flex-wrap gap-2">
                    {DELIVERY_OPTIONS.map((option) => {
                      const isActive = form.deliver.includes(option)
                      const needsGateway =
                        option === 'telegram' || option === 'discord'
                      return (
                        <button
                          key={option}
                          type="button"
                          onClick={() => toggleDelivery(option)}
                          title={
                            needsGateway
                              ? `Requires Hermes Agent gateway with ${option} configured`
                              : undefined
                          }
                          className="rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-colors"
                          style={{
                            background: isActive
                              ? 'var(--theme-accent)'
                              : 'var(--theme-card)',
                            borderColor: isActive
                              ? 'var(--theme-accent)'
                              : 'var(--theme-border)',
                            color: isActive
                              ? '#fff'
                              : needsGateway
                                ? 'var(--theme-muted)'
                                : 'var(--theme-text)',
                          }}
                        >
                          {option}
                        </button>
                      )
                    })}
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Repeat</label>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          repeatMode: 'unlimited',
                        }))
                      }
                      className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
                      style={{
                        background:
                          form.repeatMode === 'unlimited'
                            ? 'var(--theme-accent)'
                            : 'var(--theme-card)',
                        borderColor:
                          form.repeatMode === 'unlimited'
                            ? 'var(--theme-accent)'
                            : 'var(--theme-border)',
                        color:
                          form.repeatMode === 'unlimited'
                            ? '#fff'
                            : 'var(--theme-text)',
                      }}
                    >
                      Unlimited
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setForm((current) => ({
                          ...current,
                          repeatMode: 'limited',
                        }))
                      }
                      className="rounded-full border px-3 py-1.5 text-xs font-medium transition-colors"
                      style={{
                        background:
                          form.repeatMode === 'limited'
                            ? 'var(--theme-accent)'
                            : 'var(--theme-card)',
                        borderColor:
                          form.repeatMode === 'limited'
                            ? 'var(--theme-accent)'
                            : 'var(--theme-border)',
                        color:
                          form.repeatMode === 'limited'
                            ? '#fff'
                            : 'var(--theme-text)',
                      }}
                    >
                      Set count
                    </button>
                  </div>
                  {form.repeatMode === 'limited' ? (
                    <input
                      type="number"
                      min={1}
                      step={1}
                      value={form.repeatCount}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          repeatCount: event.target.value,
                        }))
                      }
                      className="w-full rounded-xl border px-3 py-2.5 text-sm focus:outline-none focus:ring-1"
                      style={{
                        background: 'var(--theme-input)',
                        borderColor: 'var(--theme-border)',
                        color: 'var(--theme-text)',
                      }}
                    />
                  ) : null}
                </div>
              </section>

              <details className="group space-y-2">
                <summary
                  className="cursor-pointer select-none text-xs font-medium"
                  style={{ color: 'var(--theme-muted)' }}
                >
                  Advanced settings
                </summary>
                <div className="space-y-4 pt-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Mode</label>
                    <p
                      className="text-xs"
                      style={{ color: 'var(--theme-muted)' }}
                    >
                      Agent uses the LLM to execute the prompt. Script Only runs a script and delivers its output directly.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setForm((current) => ({ ...current, mode: 'agent' }))}
                        className="flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
                        style={{
                          background: form.mode === 'agent' ? 'var(--theme-accent)' : 'var(--theme-card)',
                          borderColor: form.mode === 'agent' ? 'var(--theme-accent)' : 'var(--theme-border)',
                          color: form.mode === 'agent' ? '#fff' : 'var(--theme-text)',
                        }}
                      >
                        Agent
                      </button>
                      <button
                        type="button"
                        onClick={() => setForm((current) => ({ ...current, mode: 'script' }))}
                        className="flex-1 rounded-lg border px-3 py-2 text-xs font-medium transition-colors"
                        style={{
                          background: form.mode === 'script' ? 'var(--theme-accent)' : 'var(--theme-card)',
                          borderColor: form.mode === 'script' ? 'var(--theme-accent)' : 'var(--theme-border)',
                          color: form.mode === 'script' ? '#fff' : 'var(--theme-text)',
                        }}
                      >
                        Script Only
                      </button>
                    </div>
                  </div>
                </div>
              </details>
            </div>

            <div
              className="flex items-center justify-end gap-2 border-t px-5 py-4"
              style={{ borderColor: 'var(--theme-border)' }}
            >
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded-xl px-4 py-2 text-sm transition-colors"
                style={{
                  background: 'var(--theme-card)',
                  color: 'var(--theme-muted)',
                }}
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={
                  isSubmitting ||
                  !form.name.trim() ||
                  !form.schedule.trim() ||
                  (form.mode === 'agent' && !form.prompt.trim()) ||
                  (form.mode === 'script' && !form.script)
                }
                className="rounded-xl px-4 py-2 text-sm font-medium text-white transition-opacity disabled:opacity-50"
                style={{ background: 'var(--theme-accent)' }}
              >
                {isSubmitting ? 'Creating...' : 'Create'}
              </button>
            </div>
          </motion.form>
        </motion.div>
      ) : null}
    </AnimatePresence>
  )
}
