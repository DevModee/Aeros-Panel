import { promises as fs } from 'fs';
import * as os from 'os';

let previousCpu = processCpuTimes();

function processCpuTimes() {
    const cpus = os.cpus();
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

export async function getSystemMetrics() {
    const memoryTotal = os.totalmem();
    const memoryFree = os.freemem();
    const memoryUsed = memoryTotal - memoryFree;
    
    const currentCpu = processCpuTimes();
    const idleDiff = currentCpu.idle - previousCpu.idle;
    const totalDiff = currentCpu.total - previousCpu.total;
    const cpuUsage = totalDiff === 0 ? 0 : 100 - Math.floor(100 * idleDiff / totalDiff);
    previousCpu = currentCpu;
    
    let batteryPercentage = null;
    let batteryStatus = 'UNKNOWN';
    try {
        const capacity = await fs.readFile('/sys/class/power_supply/BAT0/capacity', 'utf8');
        batteryPercentage = parseInt(capacity.trim(), 10);
        const status = await fs.readFile('/sys/class/power_supply/BAT0/status', 'utf8');
        batteryStatus = status.trim().toUpperCase();
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
            cores: os.cpus().length
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
