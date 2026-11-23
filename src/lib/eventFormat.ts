import type { EventPhase, EventPrize, PrizeKind } from './eventsApi'

export const PHASE_LABELS: Record<EventPhase, string> = {
  draft: 'مسودة',
  paused: 'متوقفة',
  upcoming: 'تبدأ قريبًا',
  active: 'مباشر الآن',
  ending: 'ينتهي قريبًا',
  ended: 'انتهت',
}

export const KIND_LABELS: Record<string, string> = {
  daily: 'يومية',
  weekly: 'أسبوعية',
  competition: 'مسابقة',
  challenge: 'تحدٍ',
  occasion: 'مناسبة',
  exclusive: 'حصرية',
  game: 'لعبة',
}

export const PRIZE_KIND_LABELS: Record<PrizeKind, string> = {
  gold: 'ذهب',
  coins: 'عملات',
  diamonds: 'ألماس',
  gift: 'هدية',
  frame: 'إطار',
}

export const KIND_ICONS: Record<string, string> = {
  daily: '📅',
  weekly: '🗓️',
  competition: '🏆',
  challenge: '⚡',
  occasion: '🎉',
  exclusive: '💎',
  game: '🎮',
}

export const PRIZE_ICONS: Record<PrizeKind, string> = {
  gold: '🪙',
  coins: '🟡',
  diamonds: '💎',
  gift: '🎁',
  frame: '🖼️',
}

export function prizeText(prize: Pick<EventPrize, 'kind' | 'amount' | 'label' | 'kind_label'>): string {
  if (prize.label) return prize.label
  if (prize.kind === 'gold') return `${prize.amount} ذهب`
  if (prize.kind === 'coins') return `${prize.amount} عملة`
  if (prize.kind === 'diamonds') return `${prize.amount} ألماس`
  return prize.kind_label
}

export function formatDate(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleDateString('ar', { day: 'numeric', month: 'short' })
}

export function formatDateTime(value?: string | null): string {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('ar', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function remainingMs(target: string): number {
  const date = new Date(target)
  if (Number.isNaN(date.getTime())) return 0
  return Math.max(0, date.getTime() - Date.now())
}

export function teamLabel(team?: string | null): string {
  if (team === 'fire') return 'الفريق الناري'
  if (team === 'violet') return 'الفريق البنفسجي'
  return ''
}
