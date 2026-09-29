import { db } from '../db/db'
import { todayIso } from '../db/queries'
import { getPrefs } from './prefs'

/*
 * Erinnerungen, solange die App offen oder im Hintergrund ist (ohne eigenen Server gibt es auf
 * dem iPhone keine echten Push-Nachrichten). Einmal pro Minute wird geprüft; jede Erinnerung
 * kommt höchstens einmal am Tag bzw. einmal je Wasser-Intervall.
 */

const SENT_KEY = 'coach.reminders.sent'

function sent(): Record<string, string> {
  try {
    return JSON.parse(localStorage.getItem(SENT_KEY) ?? '{}') as Record<string, string>
  } catch {
    return {}
  }
}

function markSent(key: string, value: string): void {
  try {
    localStorage.setItem(SENT_KEY, JSON.stringify({ ...sent(), [key]: value }))
  } catch {
    // Ohne Speicher käme die Erinnerung eben noch einmal.
  }
}

async function notify(title: string, body: string): Promise<void> {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return
  try {
    const reg = await navigator.serviceWorker?.getRegistration()
    if (reg) await reg.showNotification(title, { body, icon: 'pwa-192x192.png', tag: title })
    else new Notification(title, { body })
  } catch {
    // Manche Browser erlauben Benachrichtigungen nur über den Service Worker - dann ohne.
  }
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return (h || 0) * 60 + (m || 0)
}

async function check(athleteId: string): Promise<void> {
  const { reminders } = getPrefs()
  const now = new Date()
  const today = todayIso()
  const minutes = now.getHours() * 60 + now.getMinutes()
  const entry = await db.dailyEntries.where({ athleteId, date: today }).first()
  const done = sent()

  if (reminders.weigh.on && minutes >= minutesOf(reminders.weigh.time) && done.weigh !== today && entry?.weightKg === undefined) {
    markSent('weigh', today)
    await notify('Zeit zum Wiegen', 'Kurz auf die Waage – am besten nüchtern nach dem Aufstehen.')
  }
  if (reminders.food.on && minutes >= minutesOf(reminders.food.time) && done.food !== today && (entry?.calories ?? 0) < 800) {
    markSent('food', today)
    await notify('Essen eintragen', 'Heute ist noch kaum etwas geloggt. Trag deine Mahlzeiten nach.')
  }
  // Wasser: zwischen 8 und 21 Uhr alle X Stunden.
  if (reminders.water.on && now.getHours() >= 8 && now.getHours() < 21) {
    const slot = `${today}-${Math.floor(now.getHours() / Math.max(1, reminders.water.everyHours))}`
    if (done.water !== slot) {
      markSent('water', slot)
      if (done.water?.startsWith(today)) await notify('Wasser trinken', 'Ein Glas Wasser zwischendurch?')
    }
  }
}

let timer: number | undefined
let current: string | undefined

/** Startet (bzw. wechselt) die Erinnerungen für den offenen Athleten. */
export function startReminders(athleteId: string): () => void {
  current = athleteId
  if (timer === undefined) {
    timer = window.setInterval(() => {
      if (current) void check(current)
    }, 60_000)
  }
  void check(athleteId)
  return () => {
    if (current === athleteId) current = undefined
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  if (typeof Notification === 'undefined') return 'unsupported'
  if (Notification.permission === 'default') return Notification.requestPermission()
  return Notification.permission
}
