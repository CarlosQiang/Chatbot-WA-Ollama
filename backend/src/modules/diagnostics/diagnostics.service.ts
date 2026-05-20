import { Injectable } from '@nestjs/common';
import { OpenWaService } from '../openwa/openwa.service';
import { OllamaService } from '../ollama/ollama.service';
import { SettingsService } from '../settings/settings.service';
import { LogsService } from '../logs/logs.service';

const DEFAULT_PROMPT =
  'Responde en una frase corta en español confirmando que Ollama está conectado correctamente con WhatsApp.';

const WHATSAPP_TEST_TEXT =
  '✅ Test OpenWA correcto. El backend puede enviar mensajes por WhatsApp.';

@Injectable()
export class DiagnosticsService {
  constructor(
    private readonly openwa: OpenWaService,
    private readonly ollama: OllamaService,
    private readonly settings: SettingsService,
    private readonly logs: LogsService,
  ) {}

  async testWhatsapp(chatId: string) {
    try {
      const res = await this.openwa.sendText(chatId, WHATSAPP_TEST_TEXT);
      await this.logs.write('info', 'system', `Test WhatsApp enviado a ${chatId}`);
      return {
        ok: true,
        message: 'Mensaje de test enviado correctamente',
        chatId,
        messageId: res?.id ?? res?.messageId ?? null,
      };
    } catch (err: any) {
      const error = err?.message || 'No se pudo enviar el mensaje de test por WhatsApp';
      await this.logs.write('error', 'system', `Test WhatsApp falló para ${chatId}: ${error}`);
      return { ok: false, error };
    }
  }

  async testOllamaWhatsapp(chatId: string, customPrompt?: string) {
    const prompt = (customPrompt || DEFAULT_PROMPT).trim();
    const baseUrl = await this.settings.getOllamaBaseUrl();
    const model = await this.settings.getActiveModel();

    // Paso 1: Ollama
    let reply: string;
    try {
      reply = await this.ollama.chat(model, [
        {
          role: 'system',
          content: 'Eres un asistente de pruebas que responde siempre en español, con frases cortas.',
        },
        { role: 'user', content: prompt },
      ]);
      if (!reply || !reply.trim()) {
        return {
          ok: false,
          step: 'ollama',
          error: 'Ollama devolvió respuesta vacía',
          ollamaModel: model,
          ollamaBaseUrl: baseUrl,
        };
      }
    } catch (err: any) {
      const msg = err?.message || 'No se pudo obtener respuesta de Ollama';
      await this.logs.write('error', 'system', `Test Ollama→WA falló (ollama): ${msg}`);
      return {
        ok: false,
        step: 'ollama',
        error: msg,
        ollamaModel: model,
        ollamaBaseUrl: baseUrl,
      };
    }

    // Paso 2: WhatsApp
    try {
      const res = await this.openwa.sendText(chatId, `🤖 ${reply}`);
      await this.logs.write('info', 'system', `Test Ollama→WA enviado a ${chatId} (${model})`);
      return {
        ok: true,
        message: 'Test Ollama + WhatsApp enviado correctamente',
        chatId,
        ollamaModel: model,
        ollamaBaseUrl: baseUrl,
        whatsappMessageId: res?.id ?? res?.messageId ?? null,
        reply,
      };
    } catch (err: any) {
      const msg = err?.message || 'No se pudo enviar el WhatsApp';
      await this.logs.write('error', 'system', `Test Ollama→WA falló (whatsapp): ${msg}`);
      return {
        ok: false,
        step: 'whatsapp',
        error: msg,
        ollamaModel: model,
        ollamaBaseUrl: baseUrl,
      };
    }
  }
}
