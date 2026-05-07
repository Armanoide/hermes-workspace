/**
 * Shared profile name validation.
 *
 * Single source of truth for the regex and validation functions used by
 * profile-cron and all profile-aware API routes.
 */

export const PROFILE_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/

/**
 * Validate a profile name and return it unchanged.
 * Throws on invalid input (server-side use).
 */
export function validateProfileName(name: string): string {
  if (!PROFILE_RE.test(name)) {
    throw new Error(`Invalid profile name: ${name}`)
  }
  return name
}

/**
 * Check whether a profile name is valid (route guard use).
 * "default" is always accepted; everything else must match PROFILE_RE.
 */
export function isProfileValid(name: string): boolean {
  return name === 'default' || PROFILE_RE.test(name)
}
