import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import * as dns from 'dns/promises';
import * as tls from 'tls';
import axios from 'axios';
import { hostFromUrl, isPrivateOrLoopbackHost } from '../../common/validators';

@Injectable()
export class DevToolsService {
  private readonly logger = new Logger(DevToolsService.name);

  private assertPublicHost(host: string) {
    if (isPrivateOrLoopbackHost(host)) {
      throw new BadRequestException(
        `Host privado/loopback bloqueado por seguridad: "${host}". Solo hosts publicos.`,
      );
    }
  }

  hash(algo: string, text: string): string {
    const a = algo.toLowerCase();
    const valid = ['md5', 'sha1', 'sha256', 'sha384', 'sha512'];
    if (!valid.includes(a)) {
      throw new Error(`Algoritmo invalido. Usa: ${valid.join(', ')}`);
    }
    return crypto.createHash(a).update(text).digest('hex');
  }

  allHashes(text: string) {
    return {
      md5: this.hash('md5', text),
      sha1: this.hash('sha1', text),
      sha256: this.hash('sha256', text),
      sha512: this.hash('sha512', text),
    };
  }

  base64Encode(text: string): string {
    return Buffer.from(text, 'utf-8').toString('base64');
  }
  base64Decode(b64: string): string {
    return Buffer.from(b64, 'base64').toString('utf-8');
  }

  urlEncode(text: string): string {
    return encodeURIComponent(text);
  }
  urlDecode(text: string): string {
    return decodeURIComponent(text);
  }

  jwtDecode(token: string): { header: any; payload: any; signature: string } {
    const parts = token.trim().split('.');
    if (parts.length !== 3) throw new Error('Token invalido');
    const decode = (p: string) => {
      const padded = p + '='.repeat((4 - (p.length % 4)) % 4);
      return JSON.parse(
        Buffer.from(padded.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf-8'),
      );
    };
    return {
      header: decode(parts[0]),
      payload: decode(parts[1]),
      signature: parts[2],
    };
  }

  uuidv4(): string {
    return crypto.randomUUID();
  }

  generatePassword(length = 16, opts: { symbols?: boolean } = {}): string {
    const upper = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    const lower = 'abcdefghijklmnopqrstuvwxyz';
    const nums = '0123456789';
    const syms = '!@#$%^&*()-_=+[]{}|;:,.<>?';
    const set = upper + lower + nums + (opts.symbols !== false ? syms : '');
    const bytes = crypto.randomBytes(length);
    let out = '';
    for (let i = 0; i < length; i++) out += set[bytes[i] % set.length];
    return out;
  }

  timestamp(input?: string): { unix: number; iso: string; human: string } {
    let d: Date;
    if (!input) d = new Date();
    else if (/^\d{10}$/.test(input)) d = new Date(parseInt(input, 10) * 1000);
    else if (/^\d{13}$/.test(input)) d = new Date(parseInt(input, 10));
    else {
      d = new Date(input);
      if (isNaN(d.getTime())) throw new Error('Fecha invalida');
    }
    return {
      unix: Math.floor(d.getTime() / 1000),
      iso: d.toISOString(),
      human: d.toLocaleString('es-ES', { timeZone: process.env.TZ || 'Europe/Madrid' }),
    };
  }

  regexTest(pattern: string, text: string, flags = 'g') {
    try {
      const re = new RegExp(pattern, flags);
      const matches: string[] = [];
      let match;
      while ((match = re.exec(text)) !== null) {
        matches.push(match[0]);
        if (!flags.includes('g')) break;
        if (match.index === re.lastIndex) re.lastIndex++;
      }
      return { ok: true, matches, count: matches.length };
    } catch (e: any) {
      return { ok: false, error: e.message, matches: [], count: 0 };
    }
  }

  async dnsLookup(domain: string) {
    this.assertPublicHost(domain);
    const result: any = { domain };
    try { result.A = await dns.resolve4(domain).catch(() => []); } catch {}
    try { result.AAAA = await dns.resolve6(domain).catch(() => []); } catch {}
    try { result.MX = await dns.resolveMx(domain).catch(() => []); } catch {}
    try { result.NS = await dns.resolveNs(domain).catch(() => []); } catch {}
    try { result.TXT = await dns.resolveTxt(domain).catch(() => []); } catch {}
    return result;
  }

  async httpHeaders(url: string) {
    const host = hostFromUrl(url);
    if (!host) throw new BadRequestException('URL invalida');
    this.assertPublicHost(host);
    try {
      const r = await axios.head(url, {
        timeout: 10_000,
        validateStatus: () => true,
        maxRedirects: 5,
      });
      return {
        status: r.status,
        statusText: r.statusText,
        headers: r.headers,
        url: r.request?.res?.responseUrl || url,
      };
    } catch (e: any) {
      return { error: e.message };
    }
  }

  async sslInfo(host: string, port = 443): Promise<any> {
    this.assertPublicHost(host);
    return new Promise((resolve, reject) => {
      const socket = tls.connect(
        { host, port, servername: host, rejectUnauthorized: false, timeout: 8000 },
        () => {
          const cert = socket.getPeerCertificate(true);
          socket.end();
          if (!cert || Object.keys(cert).length === 0) {
            return reject(new Error('Sin certificado'));
          }
          resolve({
            subject: cert.subject,
            issuer: cert.issuer,
            valid_from: cert.valid_from,
            valid_to: cert.valid_to,
            fingerprint256: cert.fingerprint256,
            subjectaltname: cert.subjectaltname,
            daysUntilExpiry: Math.floor(
              (new Date(cert.valid_to).getTime() - Date.now()) / 86_400_000,
            ),
          });
        },
      );
      socket.on('error', reject);
      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('timeout'));
      });
    });
  }

  async cveInfo(cveId: string) {
    const id = cveId.trim().toUpperCase();
    if (!/^CVE-\d{4}-\d{4,}$/.test(id)) {
      throw new Error('Formato invalido. Ejemplo: CVE-2024-1234');
    }
    try {
      const r = await axios.get(
        `https://services.nvd.nist.gov/rest/json/cves/2.0?cveId=${id}`,
        { timeout: 12_000 },
      );
      const v = r.data?.vulnerabilities?.[0]?.cve;
      if (!v) return { ok: false, error: 'No encontrado en NVD' };
      const en = v.descriptions?.find((d: any) => d.lang === 'en')?.value;
      const cvss =
        v.metrics?.cvssMetricV31?.[0]?.cvssData ||
        v.metrics?.cvssMetricV30?.[0]?.cvssData ||
        v.metrics?.cvssMetricV2?.[0]?.cvssData;
      return {
        ok: true,
        id: v.id,
        published: v.published,
        lastModified: v.lastModified,
        description: en,
        cvss: cvss
          ? {
              version: cvss.version,
              score: cvss.baseScore,
              severity: cvss.baseSeverity,
              vector: cvss.vectorString,
            }
          : null,
        references: (v.references || []).slice(0, 5).map((r: any) => r.url),
      };
    } catch (e: any) {
      return { ok: false, error: e.message };
    }
  }
}
