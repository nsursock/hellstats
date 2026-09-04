// Use require() directly — Electron's main process module is CJS and
// TypeScript's ESM interop helpers can interfere with it.
const { app, BrowserWindow, Menu, ipcMain } = require("electron") as typeof import("electron");
import * as path from "node:path";
import * as os from "node:os";
import si from "systeminformation";

// __dirname is available natively in CommonJS.
const isDev = !app.isPackaged;

/* ------------------------------------------------------------------ */
/*  Cross-platform system metrics                                     */
/* ------------------------------------------------------------------ */

interface ProcessInfo {
  name: string;
  cpu: number;
  mem: number; // MB
  pid: number;
}
interface CpuMetric {
  usage: number;
  cores: number[];
  temp: number | null;
  thermalState: string; // "nominal" | "fair" | "serious" | "critical"
  speeds: number[];
  speed: number | null;
  model: string;
  coreCount: number;
  physicalCores: number;
  pCores: number;
  eCores: number;
  loadAvg: [number, number, number];
  topProcesses: ProcessInfo[];
  userLoad: number;
  systemLoad: number;
}
interface RamMetric {
  total: number;
  used: number;
  free: number;
  cached: number;
  available: number;
  swapTotal: number;
  swapUsed: number;
  pressure: number;
  pressureLevel: string;
  wired: number;
  compressed: number;
  appAlloc: number;
}
interface DiskMetric {
  total: number;
  used: number;
  free: number;
  readSec: number;
  writeSec: number;
  readOpsSec: number;
  writeOpsSec: number;
  fs: string;
  mount: string;
  type: string;
  usePct: number;
  health: string; // "normal" | "warning" | "critical"
}
interface NetMetric {
  rxSec: number;
  txSec: number;
  totalRx: number;
  totalTx: number;
  iface: string;
  ifaceType: string;
  ip4: string;
  ip6: string;
  mac: string;
  latency: number | null;
  signalStrength: number | null;
  duplex: string;
  mtu: number;
  rxPackets: number;
  txPackets: number;
  rxErrors: number;
  txErrors: number;
  rxDrops: number;
  txDrops: number;
}
interface BatteryMetric {
  hasBattery: boolean;
  percent: number | null;
  charging: boolean;
  timeRemaining: number | null;
  cycleCount: number | null;
  voltage: number | null;
  powerDraw: number | null; // W
}
interface GpuMetric {
  name: string;
  cores: number | null;
  usage: number | null;
  temp: number | null;
  memTotal: number | null;
  memUsed: number | null;
  powerDraw: number | null;
}
interface NpuMetric {
  name: string;
  powerDraw: number | null; // W
  usage: number | null; // % (not always available)
}
interface PowerMetric {
  cpuPower: number | null; // W
  gpuPower: number | null; // W
  anePower: number | null; // W
  combined: number | null; // W
}
interface Metrics {
  cpu: CpuMetric;
  ram: RamMetric;
  disk: DiskMetric;
  net: NetMetric;
  battery: BatteryMetric;
  gpu: GpuMetric | null;
  npu: NpuMetric | null;
  power: PowerMetric | null;
  uptime: number;
  processCount: number;
  hostname: string;
  platform: string;
  distro: string;
  kernel: string;
}

let cachedCpuModel = "";
let cachedCpuCores = 0;
let cachedPhysicalCores = 0;
let cachedPCores = 0;
let cachedECores = 0;
let cachedIface = "";
let cachedIfaceType = "";
let cachedIfaceIp = "";
let cachedIfaceIp6 = "";
let cachedIfaceMac = "";
let cachedIfaceDuplex = "";
let cachedIfaceMtu = 0;
let cachedHostname = "";
let cachedDistro = "";
let cachedKernel = "";

async function getCpuInfo(): Promise<{ model: string; cores: number; physical: number; pCores: number; eCores: number }> {
  if (cachedCpuModel) return { model: cachedCpuModel, cores: cachedCpuCores, physical: cachedPhysicalCores, pCores: cachedPCores, eCores: cachedECores };
  try {
    const cpu = await si.cpu();
    cachedCpuModel = `${cpu.manufacturer} ${cpu.brand}`.trim();
    cachedCpuCores = cpu.cores || 0;
    cachedPhysicalCores = cpu.physicalCores || cpu.cores || 0;
  } catch {
    cachedCpuModel = "CPU";
    cachedCpuCores = 0;
    cachedPhysicalCores = 0;
  }
  if (process.platform === "darwin") {
    try {
      const { execSync } = require("child_process");
      cachedPCores = parseInt(execSync("sysctl -n hw.perflevel0.physicalcpu 2>/dev/null || echo 0", { timeout: 2000 }).toString().trim(), 10) || 0;
      cachedECores = parseInt(execSync("sysctl -n hw.perflevel1.physicalcpu 2>/dev/null || echo 0", { timeout: 2000 }).toString().trim(), 10) || 0;
    } catch { /* not Apple Silicon */ }
  }
  return { model: cachedCpuModel, cores: cachedCpuCores, physical: cachedPhysicalCores, pCores: cachedPCores, eCores: cachedECores };
}

async function getStaticInfo() {
  if (!cachedHostname) {
    try { cachedHostname = os.hostname(); } catch { cachedHostname = ""; }
  }
  if (!cachedDistro) {
    try {
      const osInfo = await si.osInfo();
      cachedDistro = `${osInfo.distro} ${osInfo.release}`;
      cachedKernel = osInfo.kernel;
    } catch { cachedDistro = ""; cachedKernel = ""; }
  }
}

async function getIfaceInfo(): Promise<{ iface: string; type: string; ip4: string; ip6: string; mac: string; duplex: string; mtu: number }> {
  if (cachedIface) {
    return { iface: cachedIface, type: cachedIfaceType, ip4: cachedIfaceIp, ip6: cachedIfaceIp6, mac: cachedIfaceMac, duplex: cachedIfaceDuplex, mtu: cachedIfaceMtu };
  }
  try {
    const def = await si.networkInterfaceDefault();
    cachedIface = def || "eth0";
    const ifaces = await si.networkInterfaces();
    const match = ifaces.find((i) => i.iface === cachedIface);
    cachedIfaceType = match?.type || "wired";
    cachedIfaceIp = match?.ip4 || "";
    cachedIfaceIp6 = match?.ip6 || "";
    cachedIfaceMac = match?.mac || "";
    cachedIfaceDuplex = match?.duplex || "";
    cachedIfaceMtu = match?.mtu || 0;
  } catch {
    cachedIface = "eth0"; cachedIfaceType = "wired"; cachedIfaceIp = ""; cachedIfaceIp6 = ""; cachedIfaceMac = ""; cachedIfaceDuplex = ""; cachedIfaceMtu = 0;
  }
  return { iface: cachedIface, type: cachedIfaceType, ip4: cachedIfaceIp, ip6: cachedIfaceIp6, mac: cachedIfaceMac, duplex: cachedIfaceDuplex, mtu: cachedIfaceMtu };
}

async function getTopProcesses(): Promise<ProcessInfo[]> {
  try {
    const procs = await si.processes();
    if (procs.list && procs.list.length) {
      return [...procs.list]
        .sort((a, b) => (b.cpu || 0) - (a.cpu || 0))
        .slice(0, 8)
        .map((p) => ({ name: p.name, cpu: p.cpu || 0, mem: p.mem || 0, pid: p.pid }));
    }
  } catch { /* ignore */ }
  return [];
}

async function getTopMemProcesses(): Promise<ProcessInfo[]> {
  try {
    const procs = await si.processes();
    if (procs.list && procs.list.length) {
      return [...procs.list]
        .sort((a, b) => (b.mem || 0) - (a.mem || 0))
        .slice(0, 8)
        .map((p) => ({ name: p.name, cpu: p.cpu || 0, mem: p.mem || 0, pid: p.pid }));
    }
  } catch { /* ignore */ }
  return [];
}

async function pingHost(host: string): Promise<number | null> {
  try {
    const { exec } = require("child_process");
    return await new Promise<number | null>((resolve) => {
      const cmd = process.platform === "darwin"
        ? `ping -c 1 -t 2 ${host}`
        : `ping -c 1 -W 2 ${host}`;
      exec(cmd, { timeout: 4000 }, (err: any, stdout: string) => {
        if (err) { resolve(null); return; }
        const match = stdout.match(/(?:round-trip|rtt)[^=]*=\s*([\d.]+)\/([\d.]+)/);
        resolve(match ? parseFloat(match[2]) : null);
      });
    });
  } catch {
    return null;
  }
}

async function getLatency(): Promise<number | null> {
  try {
    const { exec } = require("child_process");
    const gateway = await new Promise<string>((resolve) => {
      if (process.platform === "darwin") {
        exec("route -n get default 2>/dev/null | awk '/gateway/ {print $2}'", { timeout: 2000 }, (_e: any, out: string) => {
          resolve(out.trim());
        });
      } else {
        exec("ip route show default 2>/dev/null | awk '{print $3}'", { timeout: 2000 }, (_e: any, out: string) => {
          resolve(out.trim().split("\n")[0] || "");
        });
      }
    });
    if (gateway) {
      const gwLatency = await pingHost(gateway);
      if (gwLatency != null) return gwLatency;
    }
    return await pingHost("8.8.8.8");
  } catch {
    return null;
  }
}

async function getCpuTempMacOS(): Promise<number | null> {
  if (process.platform !== "darwin") return null;
  const { execFile } = require("child_process");
  const fs = require("fs");
  // Resolve absolute paths — apps launched from /Applications have a minimal PATH
  // that doesn't include /opt/homebrew/bin or /usr/local/bin.
  const candidates = [
    "/opt/homebrew/bin/smctemp",
    "/usr/local/bin/smctemp",
    "/opt/homebrew/bin/osx-cpu-temp",
    "/usr/local/bin/osx-cpu-temp",
  ];
  const smctemp = candidates.find((p: string) => { try { return fs.existsSync(p); } catch { return false; } });
  if (!smctemp) return null;
  const args = smctemp.endsWith("smctemp") ? ["-c"] : [];
  return new Promise<number | null>((resolve) => {
    execFile(smctemp, args, { timeout: 3000 }, (err: any, stdout: string) => {
      if (err || !stdout.trim()) { resolve(null); return; }
      const temp = parseFloat(stdout.trim());
      resolve(temp > 0 && temp < 130 ? temp : null);
    });
  });
}

async function getThermalStateMacOS(): Promise<string> {
  if (process.platform !== "darwin") return "nominal";
  try {
    const { exec } = require("child_process");
    return await new Promise<string>((resolve) => {
      // Check for thermal pressure via powermetrics
      exec("sudo powermetrics --samplers thermal -i 1 -n 1 2>/dev/null | grep -i 'CPU pressure' | head -1", { timeout: 5000 }, (err: any, stdout: string) => {
        if (err || !stdout.trim()) { resolve("nominal"); return; }
        const line = stdout.trim().toLowerCase();
        if (line.includes("critical")) resolve("critical");
        else if (line.includes("serious")) resolve("serious");
        else if (line.includes("fair") || line.includes("moderate")) resolve("fair");
        else resolve("nominal");
      });
    });
  } catch {
    return "nominal";
  }
}

async function getMemoryPressureMacOS(): Promise<{ pressure: number; level: string; wired: number; compressed: number; appAlloc: number; cached: number; free: number } | null> {
  if (process.platform !== "darwin") return null;
  try {
    const { exec } = require("child_process");
    return await new Promise<any>((resolve) => {
      exec("vm_stat 2>/dev/null", { timeout: 3000 }, (err: any, stdout: string) => {
        if (err) { resolve(null); return; }
        // Parse page size from first line: "(page size of 16384 bytes)"
        const psMatch = stdout.match(/page size of (\d+)/);
        const ps = psMatch ? parseInt(psMatch[1], 10) : 16384;
        const lines = stdout.split("\n");
        let free = 0, active = 0, inactive = 0, wired = 0, compressed = 0, speculative = 0;
        for (const line of lines) {
          // Format: "Pages free:                          6173."
          const m = line.match(/Pages\s+([^:]+):\s*([\d.]+)/i);
          if (m) {
            const key = m[1].trim().toLowerCase();
            const val = parseInt(m[2].replace(/\./g, ""), 10) * ps;
            if (key === "free") free = val;
            else if (key === "active") active = val;
            else if (key === "inactive") inactive = val;
            else if (key === "wired down" || key === "wired") wired = val;
            else if (key === "occupied by compressor") compressed = val;
            else if (key === "speculative") speculative = val;
          }
        }
        const cached = inactive + speculative;
        const total = wired + compressed + active + inactive + free + speculative;
        const used = wired + compressed + active;
        const pressure = total > 0 ? (used / total) * 100 : 0;
        let level = "nominal";
        if (pressure > 85) level = "critical";
        else if (pressure > 70) level = "warn";
        resolve({ pressure, level, wired, compressed, appAlloc: active, cached, free });
      });
    });
  } catch {
    return null;
  }
}

async function getWifiSignal(): Promise<number | null> {
  if (process.platform !== "darwin") return null;
  try {
    const { exec } = require("child_process");
    return await new Promise<number | null>((resolve) => {
      exec("system_profiler SPAirPortDataType 2>/dev/null | awk '/agrCtlRSSI/ {print $3}'", { timeout: 5000 }, (err: any, stdout: string) => {
        if (err || !stdout.trim()) { resolve(null); return; }
        const dbm = parseInt(stdout.trim(), 10);
        resolve(isNaN(dbm) ? null : dbm);
      });
    });
  } catch {
    return null;
  }
}

async function getGpuAndPowerInfo(): Promise<{ gpu: GpuMetric | null; npu: NpuMetric | null; power: PowerMetric | null }> {
  let name = "GPU";
  let memTotal: number | null = null;
  let cores: number | null = null;
  try {
    const graphics = await si.graphics();
    if (graphics.controllers && graphics.controllers.length) {
      const gpu = graphics.controllers[0];
      name = `${gpu.vendor} ${gpu.model}`.trim();
      memTotal = gpu.vram ?? null;
      cores = gpu.cores ? parseInt(String(gpu.cores), 10) || null : null;
    }
  } catch { /* ignore */ }

  let usage: number | null = null;
  let gpuPower: number | null = null;
  let anePower: number | null = null;
  let cpuPower: number | null = null;
  let combined: number | null = null;

  if (process.platform === "darwin") {
    try {
      const { exec } = require("child_process");
      // Single powermetrics call with all power samplers
      const pmResult = await new Promise<string>((resolve) => {
        exec("sudo powermetrics --samplers cpu_power,gpu_power,ane_power -i 1 -n 1 2>/dev/null", { timeout: 5000 }, (err: any, stdout: string) => {
          resolve(err ? "" : stdout);
        });
      });
      if (pmResult) {
        const residencyMatch = pmResult.match(/GPU HW active residency:\s+([\d.]+)%/);
        if (residencyMatch) usage = parseFloat(residencyMatch[1]);
        const gpuPwrMatch = pmResult.match(/GPU Power:\s+(\d+)\s*mW/);
        if (gpuPwrMatch) gpuPower = parseFloat(gpuPwrMatch[1]) / 1000;
        const anePwrMatch = pmResult.match(/ANE Power:\s+(\d+)\s*mW/);
        if (anePwrMatch) anePower = parseFloat(anePwrMatch[1]) / 1000;
        const cpuPwrMatch = pmResult.match(/CPU Power:\s+([\d.]+)\s*mW/);
        if (cpuPwrMatch) cpuPower = parseFloat(cpuPwrMatch[1]) / 1000;
        const combinedMatch = pmResult.match(/Combined Power.*?:\s+([\d.]+)\s*mW/);
        if (combinedMatch) combined = parseFloat(combinedMatch[1]) / 1000;
      }
    } catch { /* ignore */ }
  }

  const gpu: GpuMetric | null = {
    name, cores, usage, temp: null, memTotal, memUsed: null, powerDraw: gpuPower,
  };
  const npu: NpuMetric | null = process.platform === "darwin"
    ? { name: "Apple Neural Engine", powerDraw: anePower, usage: null }
    : null;
  const power: PowerMetric | null = process.platform === "darwin"
    ? { cpuPower, gpuPower, anePower, combined }
    : null;

  return { gpu, npu, power };
}

async function getDiskHealth(fsPath: string): Promise<string> {
  try {
    // On macOS, check if disk is APFS and healthy via diskutil
    if (process.platform === "darwin") {
      const { exec } = require("child_process");
      return await new Promise<string>((resolve) => {
        exec("diskutil info / 2>/dev/null | grep -i 'Read-Only' | head -1", { timeout: 3000 }, (err: any, stdout: string) => {
          if (err) { resolve("normal"); return; }
          // If disk is read-only, that's a warning
          resolve(stdout.toLowerCase().includes("yes") ? "warning" : "normal");
        });
      });
    }
  } catch { /* ignore */ }
  return "normal";
}

async function collectMetrics(): Promise<Metrics> {
  const cpuInfo = getCpuInfo();
  const ifaceInfo = getIfaceInfo();
  getStaticInfo();

  const [load, mem, fsSize, fsStats, net, temps, cpuSpeed, ci, ii, uptime, battery, topProcs, topMemProcs, latency, wifiSignal, gpuPowerInfo, macTemp, memPressure, thermalState, diskHealth] =
    await Promise.all([
      si.currentLoad().catch(() => null),
      si.mem().catch(() => null),
      si.fsSize().catch(() => null),
      si.fsStats().catch(() => null),
      si.networkStats().catch(() => null as any),
      si.cpuTemperature().catch(() => null),
      si.cpuCurrentSpeed().catch(() => null),
      cpuInfo,
      ifaceInfo,
      Promise.resolve(si.time()).catch(() => null),
      si.battery().catch(() => null),
      getTopProcesses(),
      getTopMemProcesses(),
      getLatency(),
      getWifiSignal(),
      getGpuAndPowerInfo(),
      getCpuTempMacOS(),
      getMemoryPressureMacOS(),
      getThermalStateMacOS(),
      getDiskHealth("/"),
    ]);

  const loadAvg = os.loadavg();
  const cpuTemp = macTemp ?? temps?.main ?? null;

  const cpu: CpuMetric = {
    usage: load?.currentLoad ?? 0,
    cores: load?.cpus?.map((c: { load: number }) => c.load) ?? [],
    temp: cpuTemp,
    thermalState,
    speeds: cpuSpeed?.cores ?? [],
    speed: cpuSpeed?.avg ?? null,
    model: ci.model,
    coreCount: ci.cores || load?.cpus?.length || 0,
    physicalCores: ci.physical,
    pCores: ci.pCores,
    eCores: ci.eCores,
    loadAvg: [loadAvg[0] ?? 0, loadAvg[1] ?? 0, loadAvg[2] ?? 0],
    topProcesses: topProcs,
    userLoad: load?.currentLoadUser ?? 0,
    systemLoad: load?.currentLoadSystem ?? 0,
  };

  const ram: RamMetric = {
    total: mem?.total ?? 0,
    used: mem?.active ?? mem?.used ?? 0,
    free: memPressure?.free ?? mem?.free ?? 0,
    cached: memPressure?.cached ?? mem?.cached ?? 0,
    available: mem?.available ?? 0,
    swapTotal: mem?.swaptotal ?? 0,
    swapUsed: mem?.swapused ?? 0,
    pressure: memPressure?.pressure ?? 0,
    pressureLevel: memPressure?.level ?? "nominal",
    wired: memPressure?.wired ?? 0,
    compressed: memPressure?.compressed ?? 0,
    appAlloc: memPressure?.appAlloc ?? 0,
  };

  let disk: DiskMetric = { total: 0, used: 0, free: 0, readSec: 0, writeSec: 0, readOpsSec: 0, writeOpsSec: 0, fs: "/", mount: "/", type: "SSD", usePct: 0, health: diskHealth };
  if (fsSize && fsSize.length) {
    // On APFS (macOS), all volumes share one container. The root "/" volume
    // shows minimal used (it's a snapshot), while "/System/Volumes/Data" has
    // the real usage. The "available" field is the true free space shared
    // across all volumes in the container.
    // Strategy: find the Data volume for used, use available for free.
    const dataVol = fsSize.find((f) => f.mount === "/System/Volumes/Data");
    const rootVol = fsSize.find((f) => f.mount === "/") ?? fsSize[0];
    const vol = dataVol ?? rootVol;
    const total = vol.size;
    const available = vol.available ?? (vol.size - vol.used);
    const used = total - available;
    disk = {
      total,
      used,
      free: available,
      readSec: Math.max(0, fsStats?.rx_sec ?? 0),
      writeSec: Math.max(0, fsStats?.wx_sec ?? 0),
      readOpsSec: Math.round(Math.max(0, fsStats?.rx_sec ?? 0) / 4096),
      writeOpsSec: Math.round(Math.max(0, fsStats?.wx_sec ?? 0) / 4096),
      fs: vol.fs,
      mount: "/",
      type: vol.type || "SSD",
      usePct: total > 0 ? (used / total) * 100 : 0,
      health: diskHealth,
    };
  }

  let netMetric: NetMetric = {
    rxSec: 0, txSec: 0, totalRx: 0, totalTx: 0,
    iface: ii.iface, ifaceType: ii.type, ip4: ii.ip4, ip6: ii.ip6, mac: ii.mac,
    latency, signalStrength: wifiSignal, duplex: ii.duplex, mtu: ii.mtu,
    rxPackets: 0, txPackets: 0, rxErrors: 0, txErrors: 0, rxDrops: 0, txDrops: 0,
  };
  if (net && Array.isArray(net)) {
    const match = net.find((n) => n.iface === ii.iface) ?? net[0];
    if (match) {
      netMetric = {
        rxSec: Math.max(0, match.rx_sec ?? 0),
        txSec: Math.max(0, match.tx_sec ?? 0),
        totalRx: match.rx_bytes ?? 0,
        totalTx: match.tx_bytes ?? 0,
        iface: match.iface, ifaceType: ii.type, ip4: ii.ip4, ip6: ii.ip6, mac: ii.mac,
        latency, signalStrength: wifiSignal, duplex: ii.duplex, mtu: ii.mtu,
        rxPackets: match.rx_packets ?? 0,
        txPackets: match.tx_packets ?? 0,
        rxErrors: match.rx_errors ?? 0,
        txErrors: match.tx_errors ?? 0,
        rxDrops: match.rx_dropped ?? 0,
        txDrops: match.tx_dropped ?? 0,
      };
    }
  }

  const bat: BatteryMetric = {
    hasBattery: battery?.hasBattery ?? false,
    percent: battery?.percent ?? null,
    charging: battery?.acConnected ?? false,
    timeRemaining: battery?.timeRemaining ?? null,
    cycleCount: battery?.cycleCount ?? null,
    voltage: battery?.voltage ?? null,
    powerDraw: battery?.designedCapacity ? null : null, // systeminformation doesn't expose power draw directly
  };

  return {
    cpu, ram, disk, net: netMetric, battery: bat,
    gpu: gpuPowerInfo?.gpu ?? null,
    npu: gpuPowerInfo?.npu ?? null,
    power: gpuPowerInfo?.power ?? null,
    uptime: uptime?.uptime ?? 0,
    processCount: 0,
    hostname: cachedHostname,
    platform: process.platform,
    distro: cachedDistro,
    kernel: cachedKernel,
  };
}

/* ------------------------------------------------------------------ */
/*  Speed test (Ookla CLI with streaming JSONL progress)               */
/* ------------------------------------------------------------------ */

interface SpeedTestResult {
  downloadMbps: number | null;
  uploadMbps: number | null;
  latencyMs: number | null;
  timestamp: number;
  server?: string;
}

interface SpeedTestProgress {
  phase: "ping" | "download" | "upload" | "done" | "error";
  downloadMbps: number | null;
  uploadMbps: number | null;
  latencyMs: number | null;
  progress: number; // 0..1
}

// Find the Ookla speedtest binary (absolute paths — apps don't inherit shell PATH)
function findOoklaSpeedtest(): string | null {
  const fs = require("fs");
  const candidates = [
    "/opt/homebrew/bin/speedtest",
    "/usr/local/bin/speedtest",
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        // Verify it's the Ookla binary, not the python speedtest-cli
        const { execSync } = require("child_process");
        const out = execSync(`${p} --version 2>&1`, { timeout: 3000 }).toString();
        if (out.includes("Ookla")) return p;
      }
    } catch { /* ignore */ }
  }
  return null;
}

const OOKLA_BIN = findOoklaSpeedtest();

async function runSpeedTest(sender?: any): Promise<SpeedTestResult> {
  if (OOKLA_BIN) {
    return runOoklaSpeedtest(sender);
  }
  // Fallback: networkQuality (macOS) or Cloudflare streams
  if (process.platform === "darwin") {
    return runNetworkQuality(sender);
  }
  return runCloudflareSpeedtest(sender);
}

function emitProgress(sender: any, p: SpeedTestProgress) {
  if (sender) sender.send("speedtest:progress", p);
}

async function runOoklaSpeedtest(sender?: any): Promise<SpeedTestResult> {
  const { spawn } = require("child_process");
  return new Promise<SpeedTestResult>((resolve) => {
    const args = ["--accept-license", "--accept-gdpr", "-f", "jsonl", "--progress-update-interval=500"];
    const proc = spawn(OOKLA_BIN, args, { timeout: 60000 });
    let result: SpeedTestResult = { downloadMbps: null, uploadMbps: null, latencyMs: null, timestamp: Date.now() };
    let buffer = "";

    proc.stdout.on("data", (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() || ""; // keep incomplete line
      for (const line of lines) {
        if (!line.trim() || !line.startsWith("{")) continue;
        try {
          const evt = JSON.parse(line);
          if (evt.type === "ping" && evt.ping) {
            emitProgress(sender, {
              phase: "ping", downloadMbps: null, uploadMbps: null,
              latencyMs: evt.ping.latency ?? null, progress: evt.ping.progress ?? 0,
            });
          } else if (evt.type === "download" && evt.download) {
            const mbps = evt.download.bandwidth ? (evt.download.bandwidth * 8) / 1e6 : null;
            emitProgress(sender, {
              phase: "download", downloadMbps: mbps, uploadMbps: null,
              latencyMs: null, progress: evt.download.progress ?? 0,
            });
          } else if (evt.type === "upload" && evt.upload) {
            const mbps = evt.upload.bandwidth ? (evt.upload.bandwidth * 8) / 1e6 : null;
            emitProgress(sender, {
              phase: "upload", downloadMbps: null, uploadMbps: mbps,
              latencyMs: null, progress: evt.upload.progress ?? 0,
            });
          } else if (evt.type === "result") {
            result = {
              downloadMbps: evt.download?.bandwidth ? (evt.download.bandwidth * 8) / 1e6 : null,
              uploadMbps: evt.upload?.bandwidth ? (evt.upload.bandwidth * 8) / 1e6 : null,
              latencyMs: evt.ping?.latency ?? null,
              timestamp: Date.now(),
              server: evt.server ? `${evt.server.name} (${evt.server.location})` : undefined,
            };
            emitProgress(sender, {
              phase: "done", downloadMbps: result.downloadMbps, uploadMbps: result.uploadMbps,
              latencyMs: result.latencyMs, progress: 1,
            });
          }
        } catch { /* ignore parse errors (license text, etc.) */ }
      }
    });

    proc.on("close", () => resolve(result));
    proc.on("error", () => resolve(result));
  });
}

async function runNetworkQuality(sender?: any): Promise<SpeedTestResult> {
  emitProgress(sender, { phase: "ping", downloadMbps: null, uploadMbps: null, latencyMs: null, progress: 0.1 });
  try {
    const { execFile } = require("child_process");
    const output = await new Promise<string>((resolve, reject) => {
      execFile("/usr/bin/networkQuality", ["-c", "-s"], { timeout: 60000 }, (err: any, stdout: string) => {
        if (err) reject(err); else resolve(stdout);
      });
    });
    const data = JSON.parse(output);
    const result: SpeedTestResult = {
      downloadMbps: data.dl_throughput ? data.dl_throughput / 1e6 : null,
      uploadMbps: data.ul_throughput ? data.ul_throughput / 1e6 : null,
      latencyMs: data.base_rtt ?? null,
      timestamp: Date.now(),
    };
    emitProgress(sender, {
      phase: "done", downloadMbps: result.downloadMbps, uploadMbps: result.uploadMbps,
      latencyMs: result.latencyMs, progress: 1,
    });
    return result;
  } catch {
    return runCloudflareSpeedtest(sender);
  }
}

// Cloudflare fallback (non-macOS or if both above fail)
async function runCloudflareSpeedtest(sender?: any): Promise<SpeedTestResult> {
  const SPEED_AGENT = new (require("https").Agent)({ keepAlive: true, maxSockets: 8 });
  emitProgress(sender, { phase: "ping", downloadMbps: null, uploadMbps: null, latencyMs: null, progress: 0.1 });
  const latencyMs = await measureLatencyCF(SPEED_AGENT);
  emitProgress(sender, { phase: "download", downloadMbps: null, uploadMbps: null, latencyMs, progress: 0.2 });

  // Stream download progress
  const dlMbps = await measureDownloadCF(SPEED_AGENT, (mbps, progress) => {
    emitProgress(sender, { phase: "download", downloadMbps: mbps, uploadMbps: null, latencyMs, progress: 0.2 + progress * 0.4 });
  });
  emitProgress(sender, { phase: "upload", downloadMbps: dlMbps, uploadMbps: null, latencyMs, progress: 0.6 });
  const ulMbps = await measureUploadCF(SPEED_AGENT, (mbps, progress) => {
    emitProgress(sender, { phase: "upload", downloadMbps: dlMbps, uploadMbps: mbps, latencyMs, progress: 0.6 + progress * 0.4 });
  });
  const result: SpeedTestResult = { downloadMbps: dlMbps, uploadMbps: ulMbps, latencyMs, timestamp: Date.now() };
  emitProgress(sender, { phase: "done", downloadMbps: dlMbps, uploadMbps: ulMbps, latencyMs, progress: 1 });
  return result;
}

function downloadStreamCF(bytes: number, agent: any): Promise<{ bytes: number; ms: number }> {
  const https = require("https");
  return new Promise<{ bytes: number; ms: number }>((resolve) => {
    const start = process.hrtime.bigint();
    let received = 0;
    let settled = false;
    const done = (bytes: number, ms: number) => { if (!settled) { settled = true; resolve({ bytes, ms }); } };
    const req = https.get(
      `https://speed.cloudflare.com/__down?bytes=${bytes}`,
      { agent, timeout: 20000 },
      (res: any) => {
        if (res.statusCode !== 200) { res.destroy(); done(0, 0); return; }
        res.on("data", (chunk: Buffer) => { received += chunk.length; });
        res.on("end", () => done(received, Number(process.hrtime.bigint() - start) / 1e6));
        res.on("error", () => done(received, Number(process.hrtime.bigint() - start) / 1e6));
      },
    );
    req.on("timeout", () => { req.destroy(); done(received, Number(process.hrtime.bigint() - start) / 1e6); });
    req.on("error", () => done(received, Number(process.hrtime.bigint() - start) / 1e6));
  });
}

async function measureDownloadCF(agent: any, onProgress?: (mbps: number, progress: number) => void): Promise<number | null> {
  const STREAMS = 6;
  const BYTES = 10_000_000;
  const start = process.hrtime.bigint();
  let completed = 0;
  const results = await Promise.all(
    Array.from({ length: STREAMS }, () =>
      downloadStreamCF(BYTES, agent).then((r) => {
        completed++;
        if (onProgress) {
          const totalBytes = completed * BYTES;
          const elapsedSec = Number(process.hrtime.bigint() - start) / 1e9;
          const mbps = elapsedSec > 0 ? (totalBytes * 8) / elapsedSec / 1e6 : 0;
          onProgress(mbps, completed / STREAMS);
        }
        return r;
      }),
    ),
  );
  const totalBytes = results.reduce((sum, r) => sum + r.bytes, 0);
  const elapsedSec = Number(process.hrtime.bigint() - start) / 1e9;
  return elapsedSec > 0 ? (totalBytes * 8) / elapsedSec / 1e6 : null;
}

function uploadStreamCF(payload: Buffer, agent: any): Promise<{ bytes: number; ms: number }> {
  const https = require("https");
  return new Promise<{ bytes: number; ms: number }>((resolve) => {
    const start = process.hrtime.bigint();
    let settled = false;
    const done = (bytes: number, ms: number) => { if (!settled) { settled = true; resolve({ bytes, ms }); } };
    const req = https.request(
      "https://speed.cloudflare.com/__up",
      {
        method: "POST",
        agent,
        headers: { "Content-Type": "application/octet-stream", "Content-Length": payload.length },
        timeout: 20000,
      },
      (res: any) => {
        res.resume();
        res.on("end", () => done(payload.length, Number(process.hrtime.bigint() - start) / 1e6));
        res.on("error", () => done(0, Number(process.hrtime.bigint() - start) / 1e6));
      },
    );
    req.on("timeout", () => { req.destroy(); done(0, Number(process.hrtime.bigint() - start) / 1e6); });
    req.on("error", () => done(0, Number(process.hrtime.bigint() - start) / 1e6));
    req.write(payload);
    req.end();
  });
}

async function measureUploadCF(agent: any, onProgress?: (mbps: number, progress: number) => void): Promise<number | null> {
  const STREAMS = 4;
  const payload = Buffer.alloc(5_000_000, 0x41);
  const start = process.hrtime.bigint();
  let completed = 0;
  const results = await Promise.all(
    Array.from({ length: STREAMS }, () =>
      uploadStreamCF(payload, agent).then((r) => {
        completed++;
        if (onProgress) {
          const totalBytes = completed * payload.length;
          const elapsedSec = Number(process.hrtime.bigint() - start) / 1e9;
          const mbps = elapsedSec > 0 ? (totalBytes * 8) / elapsedSec / 1e6 : 0;
          onProgress(mbps, completed / STREAMS);
        }
        return r;
      }),
    ),
  );
  const totalBytes = results.reduce((sum, r) => sum + r.bytes, 0);
  const elapsedSec = Number(process.hrtime.bigint() - start) / 1e9;
  return elapsedSec > 0 ? (totalBytes * 8) / elapsedSec / 1e6 : null;
}

async function measureLatencyCF(agent: any): Promise<number | null> {
  const https = require("https");
  await new Promise<void>((resolve) => {
    const req = https.get("https://speed.cloudflare.com/__down?bytes=0", { agent, timeout: 5000 }, (res: any) => {
      res.resume(); res.on("end", () => resolve()); res.on("error", () => resolve());
    });
    req.on("timeout", () => { req.destroy(); resolve(); });
    req.on("error", () => resolve());
  });
  const samples: number[] = [];
  for (let i = 0; i < 5; i++) {
    const t = await new Promise<number | null>((resolve) => {
      const start = process.hrtime.bigint();
      const req = https.get("https://speed.cloudflare.com/__down?bytes=0", { agent, timeout: 5000 }, (res: any) => {
        res.resume();
        res.on("end", () => resolve(Number(process.hrtime.bigint() - start) / 1e6));
        res.on("error", () => resolve(null));
      });
      req.on("timeout", () => { req.destroy(); resolve(null); });
      req.on("error", () => resolve(null));
    });
    if (t != null) samples.push(t);
  }
  if (!samples.length) return null;
  samples.sort((a, b) => a - b);
  return samples[Math.floor(samples.length / 2)];
}

/* ------------------------------------------------------------------ */
/*  IPC                                                                */
/* ------------------------------------------------------------------ */

ipcMain.handle("metrics:get", async () => {
  try {
    return await collectMetrics();
  } catch (e) {
    console.error("metrics error:", e);
    return null;
  }
});

ipcMain.handle("app:is-dev", () => isDev);

ipcMain.handle("speedtest:run", async (_event: any) => {
  try {
    const sender = _event.sender;
    return await runSpeedTest(sender);
  } catch (e) {
    console.error("speedtest error:", e);
    return null;
  }
});

/* ------------------------------------------------------------------ */
/*  Window                                                             */
/* ------------------------------------------------------------------ */

let mainWindow: Electron.BrowserWindow | null = null;

function createWindow(url: string) {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1000,
    minHeight: 700,
    show: false,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    backgroundColor: "#050010",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.loadURL(url);

  // Open DevTools in dev mode for debugging
  if (isDev) {
    mainWindow.webContents.openDevTools({ mode: "detach" });
  }

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

/* ------------------------------------------------------------------ */
/*  Native menu                                                        */
/* ------------------------------------------------------------------ */

function buildMenu(): Electron.Menu {
  const isMac = process.platform === "darwin";

  const appMenu: Electron.MenuItemConstructorOptions = {
    label: app.name,
    submenu: [
      { role: "about" },
      { type: "separator" },
      { role: "services" },
      { type: "separator" },
      { role: "hide" },
      { role: "hideOthers" },
      { role: "unhide" },
      { type: "separator" },
      { role: "quit" },
    ],
  };

  const fileMenu: Electron.MenuItemConstructorOptions = {
    label: "File",
    submenu: [
      isMac ? { role: "close" } : { role: "quit" },
    ],
  };

  const editMenu: Electron.MenuItemConstructorOptions = {
    label: "Edit",
    submenu: [
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "selectAll" },
    ],
  };

  const viewMenu: Electron.MenuItemConstructorOptions = {
    label: "View",
    submenu: [
      { role: "reload" },
      { role: "forceReload" },
      { role: "toggleDevTools" },
      { type: "separator" },
      { role: "resetZoom" },
      { role: "zoomIn" },
      { role: "zoomOut" },
      { type: "separator" },
      { role: "togglefullscreen" },
    ],
  };

  const windowMenu: Electron.MenuItemConstructorOptions = {
    label: "Window",
    submenu: [
      { role: "minimize" },
      { role: "zoom" },
      ...(isMac
        ? ([{ type: "separator" }, { role: "front" }] as Electron.MenuItemConstructorOptions[])
        : ([{ role: "close" }] as Electron.MenuItemConstructorOptions[])),
    ],
  };

  const template: Electron.MenuItemConstructorOptions[] = isMac
    ? [appMenu, fileMenu, editMenu, viewMenu, windowMenu]
    : [fileMenu, editMenu, viewMenu, windowMenu];

  return Menu.buildFromTemplate(template);
}

/* ------------------------------------------------------------------ */
/*  App lifecycle                                                      */
/* ------------------------------------------------------------------ */

// Single instance lock
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

app.on("second-instance", () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.whenReady().then(async () => {
  Menu.setApplicationMenu(buildMenu());

  const url = isDev
    ? "http://localhost:5173"
    : `file://${path.join(process.resourcesPath, "web", "index.html")}`;

  createWindow(url);
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0 && mainWindow === null) {
    const url = isDev
      ? "http://localhost:5173"
      : `file://${path.join(process.resourcesPath, "web", "index.html")}`;
    createWindow(url);
  }
});
