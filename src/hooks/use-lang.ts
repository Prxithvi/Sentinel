'use client'

// Lightweight client-side language store
import { useState, useCallback, useEffect } from 'react'
import { Lang, t, DictKey } from '@/lib/i18n'

const LANG_KEY = 'mplad_lang'

export function useLang() {
  // Lazy initializer — read once from localStorage on mount
  const [lang, setLang] = useState<Lang>(() => {
    if (typeof window === 'undefined') return 'en'
    const saved = window.localStorage.getItem(LANG_KEY)
    return saved === 'hi' || saved === 'en' ? saved : 'en'
  })

  // Persist on change (no setState in effect)
  useEffect(() => {
    try { window.localStorage.setItem(LANG_KEY, lang) } catch {}
  }, [lang])

  const setLanguage = useCallback((l: Lang) => setLang(l), [])

  const tr = useCallback((key: DictKey) => t(lang, key), [lang])

  return { lang, setLanguage, tr }
}
