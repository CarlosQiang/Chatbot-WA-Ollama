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
  // Aceptamos tres formatos de chatId que WhatsApp/OpenWA puede entregar:
  //  - <digits>@c.us          (formato clásico phone-based)
  //  - <digits>@s.whatsapp.net (Baileys; sinónimo de @c.us)
  //  - <digits>@lid           (LinkedId, alias opaco por contacto que WA
  //    empezó a usar más en 2025+; NO es un número de teléfono).
  return /^\d{6,20}@(c\.us|s\.whatsapp\.net|lid)$/i.test(chatId);
}

/**
 * Normaliza un chatId al formato canónico, preservando el SUFIJO real
 * para no confundir identidades distintas:
 *  - phone-based  -> `<digits>@c.us`  (sufijos `@c.us`, `@s.whatsapp.net`,
 *                                      o sin sufijo se asumen phone)
 *  - LinkedId     -> `<digits>@lid`   (`@lid` se preserva — un `@lid` NO
 *                                      es el mismo contacto que su número
 *                                      de teléfono; son namespaces aparte
 *                                      desde el punto de vista de OpenWA).
 *
 * Devuelve `null` si no se puede normalizar.
 *
 * Por qué preservamos `@lid` en lugar de remapear a `@c.us`: WhatsApp ha
 * empezado a entregar los mensajes entrantes con `@lid` en muchos casos
 * (privacy / multi-device). El número que el usuario escribe en la lista
 * Auto-IA es un teléfono (-> `@c.us`), pero el mensaje entrante puede
 * llegar con `@lid`. Estos dos chatIds NO son iguales y matchearlos a
 * ciegas no es seguro. La solución es que el usuario añada el `@lid`
 * directamente a la lista (lo verá en los logs / en el panel de "último
 * contacto"), no que los normalicemos al mismo string.
 *
 * Ejemplos:
 *   "34670209033@c.us"           -> "34670209033@c.us"
 *   "+34 670 20 90 33"           -> "34670209033@c.us"
 *   "34670209033@C.US"           -> "34670209033@c.us"
 *   "34670209033@s.whatsapp.net" -> "34670209033@c.us"
 *   "165927622602815@lid"        -> "165927622602815@lid"
 *   "165927622602815@LID"        -> "165927622602815@lid"
 *   ""                           -> null
 */
export function normalizeChatId(input: unknown): string | null {
  if (typeof input !== 'string') return null;
  const raw = input.trim();
  if (!raw) return null;

  // Detectar sufijo y aislar la parte local.
  let suffix: 'c.us' | 'lid' = 'c.us';
  let localPart = raw;
  const atIdx = raw.lastIndexOf('@');
  if (atIdx >= 0) {
    const tail = raw.slice(atIdx + 1).toLowerCase();
    localPart = raw.slice(0, atIdx);
    if (tail === 'lid') suffix = 'lid';
    else suffix = 'c.us'; // c.us, s.whatsapp.net y cualquier otro phone-like
  }

  const digits = localPart.replace(/\D/g, '');
  // Los IDs `@lid` pueden ser bastante más largos que un teléfono (hasta
  // ~20 dígitos en lo observado), así que ensanchamos el rango.
  if (!/^\d{6,20}$/.test(digits)) return null;

  return `${digits}@${suffix}`;
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
