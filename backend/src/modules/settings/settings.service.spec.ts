import { SettingsService, SETTING_KEYS } from './settings.service';
import {
  normalizeChatId,
  normalizeChatIdList,
} from '../../common/validators';

// In-memory Prisma stub. Solo modela el subconjunto de la tabla `Setting`
// que toca este test (key/value upsert + findUnique + findMany).
class InMemorySettingStore {
  private map = new Map<string, string>();

  setting = {
    findUnique: async ({ where: { key } }: { where: { key: string } }) => {
      if (!this.map.has(key)) return null;
      return { key, value: this.map.get(key)! };
    },
    upsert: async ({
      where: { key },
      create,
      update,
    }: {
      where: { key: string };
      create: { key: string; value: string };
      update: { value: string };
    }) => {
      if (this.map.has(key)) {
        this.map.set(key, update.value);
      } else {
        this.map.set(key, create.value);
      }
      return { key, value: this.map.get(key)! };
    },
    findMany: async () =>
      Array.from(this.map.entries()).map(([key, value]) => ({ key, value })),
  };
}

describe('normalizeChatId', () => {
  it('acepta el formato canónico', () => {
    expect(normalizeChatId('34670209033@c.us')).toBe('34670209033@c.us');
  });
  it('normaliza con + y espacios', () => {
    expect(normalizeChatId('+34 670 20 90 33')).toBe('34670209033@c.us');
  });
  it('normaliza @s.whatsapp.net a @c.us', () => {
    expect(normalizeChatId('34670209033@s.whatsapp.net')).toBe(
      '34670209033@c.us',
    );
  });
  it('ignora mayúsculas en el sufijo', () => {
    expect(normalizeChatId('34670209033@C.US')).toBe('34670209033@c.us');
  });
  it('acepta número con paréntesis y guiones', () => {
    expect(normalizeChatId('(34) 670-209-033')).toBe('34670209033@c.us');
  });
  it('devuelve null para strings vacíos', () => {
    expect(normalizeChatId('')).toBeNull();
    expect(normalizeChatId('   ')).toBeNull();
  });
  it('devuelve null si no hay dígitos suficientes', () => {
    expect(normalizeChatId('123@c.us')).toBeNull();
  });

  // WhatsApp ha empezado a entregar muchos mensajes con sufijo @lid
  // (LinkedId, opaco, no es el teléfono). Lo preservamos tal cual; NO
  // lo remapeamos a @c.us porque son namespaces distintos.
  it('preserva @lid en lugar de remapearlo a @c.us', () => {
    expect(normalizeChatId('165927622602815@lid')).toBe('165927622602815@lid');
  });
  it('ignora mayúsculas también en el sufijo @LID', () => {
    expect(normalizeChatId('165927622602815@LID')).toBe('165927622602815@lid');
  });
  it('acepta @lid con dígitos largos (hasta 20)', () => {
    expect(normalizeChatId('12345678901234567890@lid')).toBe(
      '12345678901234567890@lid',
    );
  });
});

describe('normalizeChatIdList', () => {
  it('procesa CSV con formatos mezclados', () => {
    expect(
      normalizeChatIdList('612345678, +34 670 20 90 33; 34999111222@c.us'),
    ).toEqual([
      '612345678@c.us',
      '34670209033@c.us',
      '34999111222@c.us',
    ]);
  });
  it('procesa array', () => {
    expect(normalizeChatIdList(['34111111111', '+34222222222'])).toEqual([
      '34111111111@c.us',
      '34222222222@c.us',
    ]);
  });
  it('deduplica', () => {
    expect(
      normalizeChatIdList('34670209033, +34670209033, 34670209033@c.us'),
    ).toEqual(['34670209033@c.us']);
  });
  it('ignora entradas inválidas silenciosamente', () => {
    expect(normalizeChatIdList('foo, 34670209033, , 12')).toEqual([
      '34670209033@c.us',
    ]);
  });
  it('acepta lista mixta @c.us + @lid sin colisionar namespaces', () => {
    expect(
      normalizeChatIdList('34670209033, 165927622602815@lid'),
    ).toEqual(['34670209033@c.us', '165927622602815@lid']);
  });
});

describe('SettingsService.isAutoReply (multi-número)', () => {
  const buildService = () => {
    const store = new InMemorySettingStore();
    const svc = new SettingsService(store as any);
    return { svc, store };
  };

  it('devuelve false cuando Auto-IA está desactivado aunque el chatId esté en la lista', async () => {
    const { svc } = buildService();
    await svc.setAutoReply(false, ['34670209033@c.us']);
    expect(await svc.isAutoReply('34670209033@c.us')).toBe(false);
  });

  it('devuelve true con un chatId en la lista', async () => {
    const { svc } = buildService();
    await svc.setAutoReply(true, ['34670209033@c.us']);
    expect(await svc.isAutoReply('34670209033@c.us')).toBe(true);
  });

  it('devuelve true con varios chatIds (semántica OR)', async () => {
    const { svc } = buildService();
    await svc.setAutoReply(true, ['34111111111', '34222222222', '+34333333333']);
    expect(await svc.isAutoReply('34111111111@c.us')).toBe(true);
    expect(await svc.isAutoReply('34222222222@c.us')).toBe(true);
    expect(await svc.isAutoReply('34333333333@c.us')).toBe(true);
    expect(await svc.isAutoReply('34999999999@c.us')).toBe(false);
  });

  it('acepta CSV string al guardar', async () => {
    const { svc } = buildService();
    await svc.setAutoReply(true, '34111111111, +34 222 22 22 22');
    expect(await svc.isAutoReply('34111111111@c.us')).toBe(true);
    expect(await svc.isAutoReply('34222222222@c.us')).toBe(true);
  });

  it('normaliza el chatId entrante (@s.whatsapp.net)', async () => {
    const { svc } = buildService();
    await svc.setAutoReply(true, ['34670209033@c.us']);
    expect(await svc.isAutoReply('34670209033@s.whatsapp.net')).toBe(true);
  });

  it('lista vacía desactiva el match', async () => {
    const { svc } = buildService();
    await svc.setAutoReply(true, ['34670209033@c.us']);
    expect(await svc.isAutoReply('34670209033@c.us')).toBe(true);
    await svc.setAutoReply(true, []);
    expect(await svc.isAutoReply('34670209033@c.us')).toBe(false);
  });

  it('migración runtime del campo single legacy', async () => {
    const { svc, store } = buildService();
    // Simula instalación antigua: solo está autoReplyChatId, no autoReplyChatIds.
    await store.setting.upsert({
      where: { key: SETTING_KEYS.AUTO_REPLY_ENABLED },
      create: { key: SETTING_KEYS.AUTO_REPLY_ENABLED, value: 'true' },
      update: { value: 'true' },
    });
    await store.setting.upsert({
      where: { key: SETTING_KEYS.AUTO_REPLY_CHAT_ID },
      create: {
        key: SETTING_KEYS.AUTO_REPLY_CHAT_ID,
        value: '+34 670 20 90 33',
      },
      update: { value: '+34 670 20 90 33' },
    });

    const r = await svc.getAutoReply();
    expect(r.enabled).toBe(true);
    expect(r.chatIds).toEqual(['34670209033@c.us']);
    expect(await svc.isAutoReply('34670209033@c.us')).toBe(true);

    // El campo nuevo debe haber quedado poblado (no se vuelve a migrar).
    const persisted = await store.setting.findUnique({
      where: { key: SETTING_KEYS.AUTO_REPLY_CHAT_IDS },
    });
    expect(persisted?.value).toBe('34670209033@c.us');
  });
});

describe('SettingsService.allowed / admin con normalización', () => {
  const buildService = () => {
    const store = new InMemorySettingStore();
    return new SettingsService(store as any);
  };

  it('isAllowed normaliza el chatId entrante', async () => {
    const svc = buildService();
    await svc.setAllowedChatIds(['+34 670 20 90 33']);
    expect(await svc.isAllowed('34670209033@c.us')).toBe(true);
    expect(await svc.isAllowed('34670209033@s.whatsapp.net')).toBe(true);
  });

  it('addAllowed normaliza antes de guardar', async () => {
    const svc = buildService();
    await svc.addAllowed('+34 670 20 90 33');
    expect(await svc.getAllowedChatIds()).toEqual(['34670209033@c.us']);
  });

  it('removeAllowed normaliza antes de borrar', async () => {
    const svc = buildService();
    await svc.setAllowedChatIds(['34111111111', '34222222222']);
    await svc.removeAllowed('+34 111 11 11 11');
    expect(await svc.getAllowedChatIds()).toEqual(['34222222222@c.us']);
  });
});
