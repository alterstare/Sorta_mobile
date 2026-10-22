// Settings live in localStorage (one JSON). Missing keys fall back to the
// defaults, so new settings need no migration.
import type { Settings } from '../shared/types'

const KEY = 'sorta-settings'

const newDevice = (): string => `phone${Math.random().toString(36).slice(2, 8)}`

export const DEFAULT_SETTINGS: Settings = {
  nasId: null,
  organizeDir: '',
  roots: {},
  uploadFrom: '',
  uploadTo: '',
  deviceId: '',
  theme: 'light',
  safeR18: 'blur',
  safeSensitive: 'show',
  cacheMB: 1024,
  autoUpdate: true,
  libRatings: ['general', 'sensitive', 'r18'],
  libRatingsPrev: null,
  libGroups: [],
  libFavOnly: false,
  libSort: 'date',
  libDir: 'desc',
  thumbSize: 's'
}

export function loadSettings(): Settings {
  let s: Partial<Settings> = {}
  try {
    s = JSON.parse(localStorage.getItem(KEY) ?? '{}') as Partial<Settings>
  } catch {
    s = {}
  }
  const out = { ...DEFAULT_SETTINGS, ...s }
  if (!out.deviceId) {
    out.deviceId = newDevice()
    saveAll(out)
  }
  return out
}

function saveAll(s: Settings): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // storage full — the settings stay for this session
  }
}

export function saveSettings(patch: Partial<Settings>): Settings {
  const s = { ...loadSettings(), ...patch }
  saveAll(s)
  return s
}
