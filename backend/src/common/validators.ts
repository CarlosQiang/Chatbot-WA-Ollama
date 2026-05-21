export function isValidOllamaUrl(url: string): boolean {
  if (!url || typeof url !== 'string') return false;
  if (/\s/.test(url)) return false;
  if (!/^https?:\/\//i.test(url)) return false;
  try {
    const u = new URL(url);
    if (!u.hostname) return false;
    return true;
  } catch {
    return false;
  }
}

export function isValidChatId(chatId: string): boolean {
  if (!chatId || typeof chatId !== 'string') return false;
  return /^\d{6,18}@c\.us$/.test(chatId);
}

/**
 * Normaliza un chatId al formato canónico `34XXXXXXXXX@c.us`.
 *
 * Acepta:
 *  - Con o sin sufijo `@c.us` / `@s.whatsapp.net`
 *  - Con o sin prefijo `+`, espacios, paréntesis, guiones
 *  - Mayúsculas/minúsculas en el sufijo
 *
 * Devuelve `null` si no se puede normalizar a algo válido.
 *
 * Ejemplos:
 *   "34670209033@c.us"       -> "34670209033@c.us"
 *   "+34 670 20 90 33"       -> "34670209033@c.us"
 *   "34670209033@C.US"       -> "34670209033@c.us"
 *   "34670209033@s.whatsapp.net" -> "34670209033@c.us"
 *   ""                       -> null
 */
export function normalizeChatId(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;

  // Si trae un sufijo conocido, conserva solo la parte numérica del local-part.
  // Si no, asume que es solo el número (con o sin "+", espacios, etc.).
  let localPart = raw;
  const atIdx = raw.indexOf('@');
  if (atIdx >= 0) {
    localPart = raw.slice(0, atIdx);
  }

  const digits = localPart.replace(/\D/g, '');
  if (!/^\d{6,18}$/.test(digits)) return null;

  return `${digits}@c.us`;
}

/**
 * Normaliza una lista de chatIds (string CSV o array) y devuelve la lista
 * canónica deduplicada. Las entradas inválidas se descartan silenciosamente
 * (la validación estricta debe hacerse en el controller si se quiere 400).
 */
export function normalizeChatIdList(input: unknown): string[] {
  if (input == null) return [];
  let raw: string[] = [];
  if (Array.isArray(input)) {
    raw = input.map((x) => (typeof x === 'string' ? x : ''));
  } else if (typeof input === 'string') {
    raw = input.split(/[,;\n]/);
  } else {
    return [];
  }
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    const n = normalizeChatId(r);
    if (n && !seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}

export function isPrivateOrLoopbackHost(host: string): boolean {
  if (!host) return true;
  const h = host.toLowerCase().trim();
  if (h === 'localhost' || h === 'host.docker.internal' || h === 'ip6-localhost') return true;
  if (h.endsWith('.localhost') || h.endsWith('.local') || h.endsWith('.internal')) return true;
  if (h === '::1' || h === '::' || h === '0:0:0:0:0:0:0:1') return true;
  if (h.startsWith('fe80:') || h.startsWith('fc00:') || h.startsWith('fd')) return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = +m[1], b = +m[2];
    if (a === 0) return true;
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true;
  }
  return false;
}

export function isLoopbackHost(host: string): boolean {
  if (!host) return true;
  const h = host.toLowerCase().trim();
  if (h === 'localhost' || h === 'ip6-localhost') return true;
  if (h === '::1' || h === '::' || h === '0:0:0:0:0:0:0:1') return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m && +m[1] === 127) return true;
  return false;
}

export function hostFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

export function isPlaceholderApiKey(key?: string): boolean {
  if (!key) return true;
  const k = key.trim();
  if (!k) return true;
  return ['internal_change_me_token', 'change_me', 'changeme', 'placeholder'].includes(k);
}

export function isPlaceholderWebhookSecret(secret?: string): boolean {
  if (!secret) return true;
  const s = secret.trim();
  if (!s) return true;
  return ['webhook_secret_change_me', 'change_me', 'changeme', 'placeholder'].includes(s);
}
