export const SCHEDULE_PRESETS = [
  { label: 'Every 15m', value: 'every 15m' },
  { label: 'Every 30m', value: 'every 30m' },
  { label: 'Every 1h', value: 'every 1h' },
  { label: 'Every 6h', value: 'every 6h' },
  { label: 'Daily', value: '0 9 * * *' },
  { label: 'Weekly', value: '0 9 * * 1' },
] as const

export const DELIVERY_OPTIONS = ['local', 'telegram', 'discord'] as const
