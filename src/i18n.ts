import en from '../locale/en.json' with { type: 'json' }
import zh from '../locale/zh-CN.json' with { type: 'json' }
import type { ChatLanguage } from './website-settings.js'

/** Translate plugin-owned display text; keep state values and user content intact. */
export function translate(language: ChatLanguage | null, source: string | null | undefined): string {
  if (!source) return ''
  const text = (language === 'en' ? en : zh).ui[source]
  return typeof text === 'string' ? text : source
}
