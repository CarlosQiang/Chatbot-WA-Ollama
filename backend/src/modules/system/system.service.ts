import { Injectable, Logger } from '@nestjs/common';
import * as os from 'os';
import * as fs from 'fs/promises';
import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';

const execAsync = promisify(exec);

@Injectable()
export class SystemService {
  private readonly logger = new Logger(SystemService.name);
  private cachedPublicIp: { value: string; ts: number } | null = null;
  private readonly PUBLIC_IP_TTL_MS = 5 * 60_000;

  async memory() {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    return {
      totalMB: Math.round(total / 1024 / 1024),
      usedMB: Math.round(used / 1024 / 1024),
      freeMB: Math.round(free / 1024 / 1024),
      percent: Math.round((used / total) * 100),
    };
  }

  async cpu() {
    const cpus = os.cpus();
    const load = os.loadavg();
    return {
      cores: cpus.length,
      model: cpus[0]?.model,
      load1: load[0],
      load5: load[1],
      load15: load[2],
    };
  }

  async disk() {
    try {
      const { stdout } = await execAsync('df -h /');
      const lines = stdout.trim().split('\n');
      const last = lines[lines.length - 1];
      const parts = last.split(/\s+/);
      return { size: parts[1], used: parts[2], avail: parts[3], percent: parts[4] };
    } catch {
      return { error: 'disk info unavailable' };
    }
  }

  async temperature() {
    const paths = [
      '/sys/class/thermal/thermal_zone0/temp',
      '/sys/class/thermal/thermal_zone1/temp',
    ];
    for (const p of paths) {
      try {
        const content = await fs.readFile(p, 'utf8');
        const tempC = parseInt(content, 10) / 1000;
        if (!isNaN(tempC) && tempC > 0) return { celsius: tempC };
      } catch {}
    }
    return { celsius: null, note: 'temperature unavailable in this container' };
  }

  uptime() {
    const seconds = os.uptime();
    return {
      seconds,
      human: this.humanUptime(seconds),
      hostname: os.hostname(),
      platform: os.platform(),
      arch: os.arch(),
    };
  }

  private humanUptime(s: number): string {
    const d = Math.floor(s / 86_400);
    const h = Math.floor((s % 86_400) / 3_600);
    const m = Math.floor((s % 3_600) / 60);
    const parts: string[] = [];
    if (d) parts.push(`${d}d`);
    if (h) parts.push(`${h}h`);
    if (m || (!d && !h)) parts.push(`${m}min`);
    return parts.join(' ');
  }

  localIps(): { iface: string; address: string; family: string; internal: boolean }[] {
    const result: any[] = [];
    const ifaces = os.networkInterfaces() as Record<string, any[] | undefined>;
    for (const name of Object.keys(ifaces)) {
      const list = ifaces[name] || [];
      for (const i of list) {
        result.push({
          iface: name,
          address: i.address,
          family: i.family,
          internal: i.internal,
        });
      }
    }
    return result;
  }

  async publicIp(force = false): Promise<{ ip: string | null; source?: string; error?: string }> {
    if (!force && this.cachedPublicIp && Date.now() - this.cachedPublicIp.ts < this.PUBLIC_IP_TTL_MS) {
      return { ip: this.cachedPublicIp.value, source: 'cache' };
    }
    const sources = [
      { url: 'https://api.ipify.org?format=json', key: 'ip' },
      { url: 'https://ifconfig.me/ip', key: null as string | null },
      { url: 'https://icanhazip.com', key: null as string | null },
    ];
    for (const s of sources) {
      try {
        const r = await axios.get(s.url, { timeout: 5_000 });
        const ip = s.key ? r.data?.[s.key] : String(r.data).trim();
        if (ip && /^[\d.:a-f]+$/i.test(ip)) {
          this.cachedPublicIp = { value: ip, ts: Date.now() };
          return { ip, source: s.url };
        }
      } catch {}
    }
    return { ip: null, error: 'No se pudo obtener la IP publica' };
  }

  async overview() {
    const [mem, cpu, disk, temp, pubIp] = await Promise.all([
      this.memory(),
      this.cpu(),
      this.disk(),
      this.temperature(),
      this.publicIp().catch(() => ({ ip: null })),
    ]);
    return {
      memory: mem,
      cpu,
      disk,
      temperature: temp,
      uptime: this.uptime(),
      localIps: this.localIps(),
      publicIp: pubIp,
    };
  }
}
