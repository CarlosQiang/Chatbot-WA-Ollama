'use client';

/**
 * Theme system — Light / Dark / System
 *
 * Estrategia anti-FOUC:
 *   1. Script inline en <head> (layout.tsx) aplica la clase `dark` ANTES de
 *      que React hidrate → sin flash en el primer render.
 *   2. Este provider sincroniza el estado React con lo que ya aplicó el script.
 *
 * Persistencia: localStorage key `theme` = 'light' | 'dark' | 'system'
 *
 * Transición suave: se añade `.theme-transitioning` al <html> durante el
 * cambio de tema (280ms) para que CSS aplique transiciones solo en ese momento,
 * evitando que TODAS las interacciones tengan latencia de transición.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

interface ThemeContextValue {
  /** Preferencia del usuario */
  theme: Theme;
  /** Tema efectivamente aplicado (light | dark) */
  resolvedTheme: ResolvedTheme;
  /** Cambiar la preferencia */
  setTheme: (t: Theme) => void;
  /** Si el provider ya montó (client-side) */
  mounted: boolean;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme:         'system',
  resolvedTheme: 'dark',
  setTheme:      () => {},
  mounted:       false,
});

// ── Helpers ───────────────────────────────────────────────────────────────

function getSystemPreference(): ResolvedTheme {
  if (typeof window === 'undefined') return 'dark';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function resolveTheme(t: Theme): ResolvedTheme {
  if (t === 'system') return getSystemPreference();
  return t;
}

function applyTheme(resolved: ResolvedTheme) {
  const html = document.documentElement;
  html.classList.toggle('dark', resolved === 'dark');
  // Actualiza color-scheme en el meta viewport también
  html.style.colorScheme = resolved;
}

// ── Provider ──────────────────────────────────────────────────────────────

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>('dark');
  const [mounted, setMounted] = useState(false);
  const transitionTimerRef = useRef<ReturnType<typeof setTimeout>>();

  // Montar: leer preferencia de localStorage
  useEffect(() => {
    const stored = (localStorage.getItem('theme') as Theme | null) || 'system';
    const resolved = resolveTheme(stored);
    setThemeState(stored);
    setResolvedTheme(resolved);
    setMounted(true);
  }, []);

  // Aplicar tema cuando cambia
  useEffect(() => {
    if (!mounted) return;

    const resolved = resolveTheme(theme);
    const html = document.documentElement;

    // Añadir clase de transición antes de cambiar
    html.classList.add('theme-transitioning');
    applyTheme(resolved);
    setResolvedTheme(resolved);

    // Quitar clase de transición tras la duración
    clearTimeout(transitionTimerRef.current);
    transitionTimerRef.current = setTimeout(() => {
      html.classList.remove('theme-transitioning');
    }, 320);

    localStorage.setItem('theme', theme);

    return () => clearTimeout(transitionTimerRef.current);
  }, [theme, mounted]);

  // Escuchar cambios del sistema cuando el modo es 'system'
  useEffect(() => {
    if (!mounted || theme !== 'system') return;

    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const resolved = resolveTheme('system');
      applyTheme(resolved);
      setResolvedTheme(resolved);
    };

    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme, mounted]);

  const setTheme = useCallback((t: Theme) => setThemeState(t), []);

  return (
    <ThemeContext.Provider value={{ theme, resolvedTheme, setTheme, mounted }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ── Hook ──────────────────────────────────────────────────────────────────

export function useTheme() {
  return useContext(ThemeContext);
}

// El script anti-FOUC está en @/lib/theme-script (sin 'use client')
// para poder importarlo desde layout.tsx (Server Component).
