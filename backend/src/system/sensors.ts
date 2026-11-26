import { promises as fs } from 'fs';
import * as os from 'os';

// os.cpus() is synchronous and was the top CPU cost under load (two calls per request).
// Call it once per sample and serve concurrent callers from a short lazy cache.
const METRICS_TTL_MS = 1000;
let cachedMetrics: { at: number; value: ReturnType<typeof collectSystemMetrics> } | null = null;
let previousCpu = processCpuTimes(os.cpus());
let cpuSummary: { model: string; cores: number } | null = null;

function processCpuTimes(cpus: os.CpuInfo[]) {
    let idle = 0;
    let total = 0;

    for (const cpu of cpus) {
        for (const type in cpu.times) {
            total += cpu.times[type as keyof typeof cpu.times];
        }
        idle += cpu.times.idle;
    }

    return { idle, total };
}

export function getCpuSummary(): { model: string; cores: number } {
    if (!cpuSummary) {
        const cpus = os.cpus();
        cpuSummary = { model: cpus[0]?.model || 'Unknown CPU', cores: cpus.length };
    }
    return cpuSummary;
}

export function getSystemMetrics() {
    const now = Date.now();
    if (!cachedMetrics || now - cachedMetrics.at >= METRICS_TTL_MS) {
        cachedMetrics = { at: now, value: collectSystemMetrics() };
    }
    return cachedMetrics.value;
}

async function collectSystemMetrics() {
    const memoryTotal = os.totalmem();
    const memoryFree = os.freemem();
    const memoryUsed = memoryTotal - memoryFree;

    const cpus = os.cpus();
    const currentCpu = processCpuTimes(cpus);
    const idleDiff = currentCpu.idle - previousCpu.idle;
    const totalDiff = currentCpu.total - previousCpu.total;
    const cpuUsage = totalDiff === 0 ? 0 : 100 - Math.floor(100 * idleDiff / totalDiff);
    previousCpu = currentCpu;

    let batteryPercentage = null;
    let batteryStatus = 'UNKNOWN';
    try {
        const supplies = await fs.readdir('/sys/class/power_supply');
        const batDir = supplies.find(s => s.startsWith('BAT'));
        if (batDir) {
            const capacity = await fs.readFile(`/sys/class/power_supply/${batDir}/capacity`, 'utf8');
            batteryPercentage = parseInt(capacity.trim(), 10);
            const status = await fs.readFile(`/sys/class/power_supply/${batDir}/status`, 'utf8');
            batteryStatus = status.trim().toUpperCase();
        } else {
            batteryStatus = 'AC_POWER';
            batteryPercentage = 100;
        }
    } catch {
        batteryStatus = 'NOT_FOUND';
    }

    let temperature = null;
    try {
        const temp = await fs.readFile('/sys/class/thermal/thermal_zone0/temp', 'utf8');
        temperature = parseInt(temp.trim(), 10) / 1000;
    } catch {
        temperature = null;
    }

    let storage = { total: 0, used: 0, percentage: 0 };
    try {
        const stats = await fs.statfs('/');
        storage.total = stats.blocks * stats.bsize;
        const free = stats.bfree * stats.bsize;
        storage.used = storage.total - free;
        storage.percentage = storage.total > 0 ? (storage.used / storage.total) * 100 : 0;
    } catch {}

    return {
        cpu: {
            usage: cpuUsage,
            cores: cpus.length
        },
        memory: {
            total: memoryTotal,
            used: memoryUsed,
            percentage: (memoryUsed / memoryTotal) * 100
        },
        storage,
        thermal: {
            temperature
        },
        battery: {
            percentage: batteryPercentage,
            status: batteryStatus
        }
    };
}
