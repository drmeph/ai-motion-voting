/**
 * Event branding/config. Change these values here; nothing else needs editing.
 */

/** Link shown on the mobile voting page. TODO: confirm the exact URL. */
export const AI_MOTION_PAGE_URL =
  import.meta.env.VITE_AI_MOTION_PAGE_URL ?? 'https://leadbounty.com/ai-motion';

/**
 * Logo file served from /public. Replace public/ai-motion-logo.svg with the
 * real logo (keep the name, or change this path, e.g. to a .png).
 */
export const LOGO_SRC = `${import.meta.env.BASE_URL}ai-motion-logo.svg`;

/** Timer presets offered on the admin page, in minutes. */
export const TIMER_PRESETS_MIN = [2, 3];

/** The timer turns amber below this many ms remaining. */
export const TIMER_WARN_MS = 30_000;
