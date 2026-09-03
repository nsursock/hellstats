<script lang="ts">
  import { onMount } from "svelte";
  import gsap from "gsap";
  import ThreeBackground from "./lib/components/ThreeBackground.svelte";
  import ThemeSwitcher from "./lib/components/ThemeSwitcher.svelte";
  import MetricCard from "./lib/components/MetricCard.svelte";
  import Sparkline from "./lib/components/Sparkline.svelte";
  import ProcList from "./lib/components/ProcList.svelte";
  import { themeStore } from "./lib/themes.svelte";
  import { IconCpu, IconChartLine, IconGridDots, IconTemperature, IconStack, IconComponents, IconDatabase, IconExchange, IconNetwork, IconWifi, IconAlertCircle, IconBox, IconCircleDot, IconClock, IconPalette, IconCube } from "@tabler/icons-svelte";

  interface ProcessInfo { name: string; cpu: number; mem: number; pid: number }
  interface Metrics {
    cpu: {
      usage: number; cores: number[]; temp: number | null; thermalState: string;
      speeds: number[]; speed: number | null; model: string; coreCount: number;
      physicalCores: number; pCores: number; eCores: number;
      loadAvg: [number, number, number]; topProcesses: ProcessInfo[];
      userLoad: number; systemLoad: number;
    };
    ram: { total: number; used: number; free: number; cached: number; available: number; swapTotal: number; swapUsed: number; pressure: number; pressureLevel: string; wired: number; compressed: number; appAlloc: number };
    disk: { total: number; used: number; free: number; readSec: number; writeSec: number; readOpsSec: number; writeOpsSec: number; fs: string; mount: string; type: string; usePct: number; health: string };
    net: { rxSec: number; txSec: number; totalRx: number; totalTx: number; iface: string; ifaceType: string; ip4: string; ip6: string; mac: string; latency: number | null; signalStrength: number | null; duplex: string; mtu: number; rxPackets: number; txPackets: number; rxErrors: number; txErrors: number; rxDrops: number; txDrops: number };
    battery: { hasBattery: boolean; percent: number | null; charging: boolean; timeRemaining: number | null; cycleCount: number | null; voltage: number | null; powerDraw: number | null };
    gpu: { name: string; cores: number | null; usage: number | null; temp: number | null; memTotal: number | null; memUsed: number | null; powerDraw: number | null } | null;
    npu: { name: string; powerDraw: number | null; usage: number | null } | null;
    power: { cpuPower: number | null; gpuPower: number | null; anePower: number | null; combined: number | null } | null;
    uptime: number; processCount: number; hostname: string; platform: string; distro: string; kernel: string;
  }

  let metrics = $state<Metrics | null>(null);
  let pollId: ReturnType<typeof setInterval> | null = null;
  let procSort = $state<"cpu" | "mem">("cpu");
  let threeEnabled = $state(false);

  const HIST = 60;
  let cpuHist = $state<number[]>([]);
  let cpuUserHist = $state<number[]>([]);
  let cpuSysHist = $state<number[]>([]);
  let ramHist = $state<number[]>([]);
  let ramPressureHist = $state<number[]>([]);
  let diskHist = $state<number[]>([]);
  let diskReadHist = $state<number[]>([]);
  let diskWriteHist = $state<number[]>([]);
  let netRxHist = $state<number[]>([]);
  let netTxHist = $state<number[]>([]);
  let tempHist = $state<number[]>([]);
  let latencyHist = $state<number[]>([]);
  let gpuHist = $state<number[]>([]);

  let dispCpu = $state(0);
  let dispRam = $state(0);
  let dispDisk = $state(0);
  let dispPressure = $state(0);

  // Single rAF-based interpolator — batches all 4 tweens into one loop, one $state update per frame
  let tweenRaf: number | null = null;
  let tweenStart = 0;
  const tweenFrom = { cpu: 0, ram: 0, disk: 0, pressure: 0 };
  const tweenTo = { cpu: 0, ram: 0, disk: 0, pressure: 0 };
  const TWEEN_DURATION = 600;

  function startTween(targets: { cpu: number; ram: number; disk: number; pressure: number }) {
    tweenFrom.cpu = dispCpu; tweenFrom.ram = dispRam;
    tweenFrom.disk = dispDisk; tweenFrom.pressure = dispPressure;
    tweenTo.cpu = targets.cpu; tweenTo.ram = targets.ram;
    tweenTo.disk = targets.disk; tweenTo.pressure = targets.pressure;
    tweenStart = performance.now();
    if (tweenRaf == null) tweenRaf = requestAnimationFrame(tweenStep);
  }

  function tweenStep(ts: number) {
    const elapsed = ts - tweenStart;
    const t = Math.min(1, elapsed / TWEEN_DURATION);
    const e = 1 - Math.pow(1 - t, 3); // power3.out
    dispCpu = tweenFrom.cpu + (tweenTo.cpu - tweenFrom.cpu) * e;
    dispRam = tweenFrom.ram + (tweenTo.ram - tweenFrom.ram) * e;
    dispDisk = tweenFrom.disk + (tweenTo.disk - tweenFrom.disk) * e;
    dispPressure = tweenFrom.pressure + (tweenTo.pressure - tweenFrom.pressure) * e;
    if (t < 1) {
      tweenRaf = requestAnimationFrame(tweenStep);
    } else {
      tweenRaf = null;
    }
  }

  interface Event { time: string; msg: string; level: "info" | "warn" | "critical" }
  let events = $state<Event[]>([]);
  let prevPressure = 0;
  let prevSwapUsed = 0;
  let prevCpuUsage = 0;
  let prevTemp: number | null = null;

  function addEvent(msg: string, level: "info" | "warn" | "critical" = "info") {
    const now = new Date();
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
    events = [{ time, msg, level }, ...events].slice(0, 15);
  }

  const api = (window as any).hellstats;

  async function poll() {
    if (!api) return;
    try {
      const m: Metrics = await api.getMetrics();
      if (!m) return;
      metrics = m;
      cpuHist = [...cpuHist, m.cpu.usage].slice(-HIST);
      cpuUserHist = [...cpuUserHist, m.cpu.userLoad].slice(-HIST);
      cpuSysHist = [...cpuSysHist, m.cpu.systemLoad].slice(-HIST);
      ramHist = [...ramHist, (m.ram.used / m.ram.total) * 100].slice(-HIST);
      ramPressureHist = [...ramPressureHist, m.ram.pressure].slice(-HIST);
      diskHist = [...diskHist, (m.disk.used / m.disk.total) * 100].slice(-HIST);
      diskReadHist = [...diskReadHist, m.disk.readSec].slice(-HIST);
      diskWriteHist = [...diskWriteHist, m.disk.writeSec].slice(-HIST);
      netRxHist = [...netRxHist, m.net.rxSec].slice(-HIST);
      netTxHist = [...netTxHist, m.net.txSec].slice(-HIST);
      if (m.cpu.temp != null) tempHist = [...tempHist, m.cpu.temp].slice(-HIST);
      if (m.net.latency != null) latencyHist = [...latencyHist, m.net.latency].slice(-HIST);
      if (m.gpu?.usage != null) gpuHist = [...gpuHist, m.gpu.usage].slice(-HIST);
      startTween({
        cpu: m.cpu.usage,
        ram: (m.ram.used / m.ram.total) * 100,
        disk: (m.disk.used / m.disk.total) * 100,
        pressure: m.ram.pressure,
      });

      if (prevPressure > 0) {
        if (m.ram.pressureLevel === "critical" && prevPressure < 85) addEvent("Memory pressure critical", "critical");
        else if (m.ram.pressureLevel === "warn" && prevPressure < 70) addEvent("Memory pressure elevated", "warn");
        else if (m.ram.pressureLevel === "nominal" && prevPressure >= 70) addEvent("Memory pressure normalized", "info");
        if (m.ram.swapUsed > prevSwapUsed + 100 * 1024 * 1024) addEvent(`Swap +${fmtBytes(m.ram.swapUsed - prevSwapUsed)}`, "warn");
        if (m.cpu.usage > 80 && prevCpuUsage < 80) addEvent(`CPU peaked at ${m.cpu.usage.toFixed(0)}%`, "warn");
        if (m.cpu.temp != null && m.cpu.temp > 85 && (prevTemp == null || prevTemp <= 85)) addEvent(`CPU temp ${m.cpu.temp.toFixed(0)}°C`, "critical");
        if (m.cpu.thermalState !== "nominal" && m.cpu.thermalState !== "fair") addEvent(`Thermal: ${m.cpu.thermalState}`, "critical");
        if (m.disk.usePct > 90) addEvent(`Disk ${m.disk.usePct.toFixed(0)}% full`, "warn");
        if (m.net.rxDrops > 0 || m.net.txDrops > 0) addEvent(`Packets dropped`, "warn");
      }
      prevPressure = m.ram.pressure; prevSwapUsed = m.ram.swapUsed; prevCpuUsage = m.cpu.usage; prevTemp = m.cpu.temp;
    } catch (e) { console.error("[Hellstats] poll error:", e); }
  }

  function fmtBytes(b: number): string {
    if (b >= 1e12) return (b / 1e12).toFixed(2) + " TB";
    if (b >= 1e9) return (b / 1e9).toFixed(1) + " GB";
    if (b >= 1e6) return (b / 1e6).toFixed(1) + " MB";
    if (b >= 1e3) return (b / 1e3).toFixed(1) + " KB";
    return b + " B";
  }
  function fmtRate(bps: number): string {
    if (bps >= 1e9) return (bps / 1e9).toFixed(2) + " GB/s";
    if (bps >= 1e6) return (bps / 1e6).toFixed(1) + " MB/s";
    if (bps >= 1e3) return (bps / 1e3).toFixed(1) + " KB/s";
    return bps.toFixed(0) + " B/s";
  }
  function fmtUptime(s: number): string {
    const d = Math.floor(s / 86400); const h = Math.floor((s % 86400) / 3600); const m = Math.floor((s % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`; if (h > 0) return `${h}h ${m}m`; return `${m}m`;
  }
  function fmtPackets(n: number): string {
    if (n >= 1e6) return (n / 1e6).toFixed(1) + "M"; if (n >= 1e3) return (n / 1e3).toFixed(1) + "K"; return String(n);
  }
  function netMaxVal(): number { return Math.max(1, ...netRxHist, ...netTxHist); }
  function diskIOMax(): number { return Math.max(1, ...diskReadHist, ...diskWriteHist); }
  function signalBars(dbm: number | null): number {
    if (dbm == null) return 0; if (dbm >= -50) return 4; if (dbm >= -60) return 3; if (dbm >= -70) return 2; if (dbm >= -80) return 1; return 0;
  }
  function pressureColor(level: string): string {
    if (level === "critical") return "var(--color-error)"; if (level === "warn") return "var(--color-warning)"; return "var(--color-success)";
  }
  function tempColor(t: number | null): string {
    if (t == null) return "var(--color-muted)"; if (t > 85) return "var(--color-error)"; if (t > 70) return "var(--color-warning)"; return "var(--color-success)";
  }
  function healthScore(): { score: number; level: string; details: { label: string; status: string; color: string }[] } {
    if (!metrics) return { score: 100, level: "HEALTHY", details: [] };
    let score = 100; const details: { label: string; status: string; color: string }[] = [];
    const cpuStatus = metrics.cpu.thermalState === "critical" || metrics.cpu.thermalState === "serious" ? "THROTTLED" : metrics.cpu.usage > 90 ? "HIGH" : metrics.cpu.temp != null && metrics.cpu.temp > 85 ? "HOT" : "NORMAL";
    const cpuColor = cpuStatus === "THROTTLED" || cpuStatus === "HOT" ? "var(--color-error)" : cpuStatus === "HIGH" ? "var(--color-warning)" : "var(--color-success)";
    if (cpuStatus !== "NORMAL") score -= 15;
    details.push({ label: "CPU", status: cpuStatus, color: cpuColor });
    const memStatus = metrics.ram.pressureLevel === "critical" ? "CRITICAL" : metrics.ram.pressureLevel === "warn" ? "ELEVATED" : metrics.ram.swapUsed > 500 * 1024 * 1024 ? "SWAPPING" : "NORMAL";
    const memColor = memStatus === "CRITICAL" ? "var(--color-error)" : memStatus === "ELEVATED" || memStatus === "SWAPPING" ? "var(--color-warning)" : "var(--color-success)";
    if (memStatus !== "NORMAL") score -= 20;
    details.push({ label: "Memory", status: memStatus, color: memColor });
    const diskStatus = metrics.disk.usePct > 90 ? "ALMOST FULL" : metrics.disk.health !== "normal" ? "WARNING" : "NORMAL";
    const diskColor = diskStatus !== "NORMAL" ? "var(--color-warning)" : "var(--color-success)";
    if (diskStatus !== "NORMAL") score -= 10;
    details.push({ label: "Storage", status: diskStatus, color: diskColor });
    const netStatus = metrics.net.rxDrops > 0 || metrics.net.txDrops > 0 ? "DROPPING" : metrics.net.rxErrors > 0 || metrics.net.txErrors > 0 ? "ERRORS" : metrics.net.latency != null && metrics.net.latency > 200 ? "SLOW" : "NORMAL";
    const netColor = netStatus === "DROPPING" || netStatus === "ERRORS" ? "var(--color-error)" : netStatus === "SLOW" ? "var(--color-warning)" : "var(--color-success)";
    if (netStatus !== "NORMAL") score -= 10;
    details.push({ label: "Network", status: netStatus, color: netColor });
    const thermStatus = metrics.cpu.thermalState === "critical" ? "CRITICAL" : metrics.cpu.thermalState === "serious" ? "SERIOUS" : metrics.cpu.thermalState === "fair" ? "FAIR" : "NORMAL";
    const thermColor = thermStatus === "CRITICAL" || thermStatus === "SERIOUS" ? "var(--color-error)" : thermStatus === "FAIR" ? "var(--color-warning)" : "var(--color-success)";
    if (thermStatus !== "NORMAL") score -= 15;
    details.push({ label: "Thermals", status: thermStatus, color: thermColor });
    score = Math.max(0, score);
    const level = score >= 90 ? "HEALTHY" : score >= 70 ? "DEGRADED" : score >= 50 ? "WARNING" : "CRITICAL";
    return { score, level, details };
  }
  function sortedProcs(): ProcessInfo[] {
    if (!metrics) return [];
    const procs = [...metrics.cpu.topProcesses];
    return procSort === "mem" ? procs.sort((a, b) => b.mem - a.mem) : procs.sort((a, b) => b.cpu - a.cpu);
  }

  const A = "#ff2e9a"; const A2 = "#b46bff"; const A3 = "#2ee6ff";

  onMount(() => {
    themeStore.init(); poll(); pollId = setInterval(poll, 1500);
    gsap.from(".dash-header", { y: -20, opacity: 0, duration: 0.5, ease: "power2.out" });
    gsap.from(".health-summary", { opacity: 0, duration: 0.5, delay: 0.2 });
    return () => { if (pollId) clearInterval(pollId); if (tweenRaf) cancelAnimationFrame(tweenRaf); };
  });
</script>

<ThreeBackground enabled={threeEnabled} />

<div class="dashboard">
  <!-- ═══ Header ═══ -->
  <header class="dash-header">
    <div>
      <div class="hero-title title">Hellstats</div>
      <div class="subtitle">{metrics?.hostname ?? ""} · {metrics?.distro ?? ""} · up {fmtUptime(metrics?.uptime ?? 0)}</div>
    </div>
    <div style="display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap;">
      {#if metrics}
        {@const hs = healthScore()}
        <div class="health-bar">
          <div class="health-dot {hs.score >= 90 ? 'healthy' : hs.score >= 70 ? 'warn' : 'critical'}"></div>
          <span class="health-label">{hs.level}</span>
          <span class="health-score">{hs.score}</span>
        </div>
      {/if}
      {#if metrics?.battery.hasBattery && metrics.battery.percent != null}
        <span class="battery-pill {metrics.battery.charging ? 'charging' : metrics.battery.percent < 20 ? 'low' : ''}">
          {metrics.battery.charging ? "⚡" : "🔋"} {metrics.battery.percent.toFixed(0)}%
        </span>
      {/if}
      <button class="icon-btn three-toggle {threeEnabled ? 'active' : ''}" onclick={() => threeEnabled = !threeEnabled} title="Toggle 3D Background" aria-label="Toggle 3D Background">
        <IconCube size={24} />
      </button>
      <ThemeSwitcher />
    </div>
  </header>

  <!-- ═══ Health Summary ═══ -->
  {#if metrics}
    {@const hs = healthScore()}
    <div class="health-summary">
      {#each hs.details as d}
        <div class="hs-item">
          <div class="hs-dot" style="background:{d.color};"></div>
          <span class="hs-label">{d.label}</span>
          <span class="hs-status" style="color:{d.color};">{d.status}</span>
        </div>
      {/each}
    </div>
  {/if}

  <!-- ═══ Masonry Grid — auto-reflow columns ═══ -->
  <div class="card-grid">
      <!-- CPU Overview -->
      <MetricCard label="CPU" index={0}>
        {#snippet icon()}<IconCpu size={26} />{/snippet}
        {#snippet children()}
          <div class="big-metric">
            <span class="big-number" style="color:{dispCpu > 80 ? 'var(--color-error)' : dispCpu > 60 ? 'var(--color-warning)' : 'var(--color-text)'};">{dispCpu.toFixed(0)}<span class="big-unit">%</span></span>
            {#if metrics?.cpu.temp != null}
              <span class="big-side" style="color:{tempColor(metrics.cpu.temp)};">{metrics.cpu.temp.toFixed(0)}°C</span>
            {/if}
          </div>
          {#if metrics?.cpu.thermalState && metrics.cpu.thermalState !== "nominal"}
            <div class="thermal-warning">⚠ {metrics.cpu.thermalState === "critical" ? "THERMAL THROTTLING" : "HIGH THERMAL PRESSURE"}</div>
          {/if}
          <div class="kv-grid">
            <div class="kv"><span class="kv-k">User</span><span class="kv-v">{#if metrics}{metrics.cpu.userLoad.toFixed(1)}%{/if}</span></div>
            <div class="kv"><span class="kv-k">System</span><span class="kv-v">{#if metrics}{metrics.cpu.systemLoad.toFixed(1)}%{/if}</span></div>
            <div class="kv"><span class="kv-k">Load 1m</span><span class="kv-v">{#if metrics}{metrics.cpu.loadAvg[0].toFixed(2)}{/if}</span></div>
            <div class="kv"><span class="kv-k">Load 5m</span><span class="kv-v">{#if metrics}{metrics.cpu.loadAvg[1].toFixed(2)}{/if}</span></div>
            <div class="kv"><span class="kv-k">Load 15m</span><span class="kv-v">{#if metrics}{metrics.cpu.loadAvg[2].toFixed(2)}{/if}</span></div>
            <div class="kv"><span class="kv-k">Cores</span><span class="kv-v">{#if metrics}{metrics.cpu.pCores > 0 ? `${metrics.cpu.pCores}P+${metrics.cpu.eCores}E` : metrics.cpu.coreCount}{/if}</span></div>
          </div>
          <div class="card-sub" style="margin-top:0.3rem;font-size:0.625rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{metrics?.cpu.model ?? ""}</div>
        {/snippet}
      </MetricCard>

      <!-- CPU History -->
      <MetricCard label="CPU History" index={1}>
        {#snippet icon()}<IconChartLine size={26} />{/snippet}
        {#snippet children()}
          <Sparkline series={[
            { data: cpuHist, color: A, fill: true },
            { data: cpuUserHist, color: A3 },
            { data: cpuSysHist, color: A2 },
          ]} max={100} height={60} />
          <div class="legend-row">
            <span><span class="legend-dot" style="background:{A};"></span>Total</span>
            <span><span class="legend-dot" style="background:{A3};"></span>User</span>
            <span><span class="legend-dot" style="background:{A2};"></span>System</span>
          </div>
        {/snippet}
      </MetricCard>

      <!-- Per-Core -->
      <MetricCard label="Per-Core Load" index={2}>
        {#snippet icon()}<IconGridDots size={26} />{/snippet}
        {#snippet children()}
          {#if metrics?.cpu.cores.length}
            <div class="core-grid pe-cores" style="grid-template-columns: repeat({Math.min(6, metrics.cpu.cores.length)}, 1fr);">
              {#each metrics.cpu.cores as core, i}
                <div class="core-cell {metrics.cpu.pCores > 0 ? (i < metrics.cpu.pCores ? 'pe' : 'e') : ''}">
                  <span class="core-label">{i}</span>
                  <div class="core-bar-track"><div class="core-bar-fill" style="width: {Math.min(100, core)}%"></div></div>
                  <span class="core-pct">{core.toFixed(0)}</span>
                </div>
              {/each}
            </div>
            {#if metrics.cpu.pCores > 0}
              <div class="legend-row" style="margin-top:0.4rem;">
                <span><span class="legend-dot" style="background:var(--color-accent);"></span>P-Cores ({metrics.cpu.pCores})</span>
                <span><span class="legend-dot" style="background:var(--color-accent-cyan);"></span>E-Cores ({metrics.cpu.eCores})</span>
              </div>
            {/if}
          {/if}
        {/snippet}
      </MetricCard>

      <!-- Temperature -->
      {#if tempHist.length > 2}
        <MetricCard label="Temperature" index={3}>
        {#snippet icon()}<IconTemperature size={26} />{/snippet}
          {#snippet children()}
            <div class="big-metric">
              <span class="big-number" style="color:{tempColor(metrics?.cpu.temp ?? null)};">{#if metrics?.cpu.temp != null}{metrics.cpu.temp.toFixed(0)}<span class="big-unit">°C</span>{:else}—{/if}</span>
            </div>
            <Sparkline series={[{ data: tempHist, color: A2, fill: true }]} max={Math.max(30, ...tempHist) * 1.1} height={50} />
          {/snippet}
        </MetricCard>
      {/if}

      <!-- Memory Pressure -->
      <MetricCard label="Memory" index={4}>
        {#snippet icon()}<IconStack size={26} />{/snippet}
        {#snippet children()}
          <div class="big-metric">
            <span class="big-number" style="color:{pressureColor(metrics?.ram.pressureLevel ?? 'nominal')};">{dispPressure.toFixed(0)}<span class="big-unit">%</span></span>
            {#if metrics}
              <span class="big-side" style="color:{pressureColor(metrics.ram.pressureLevel)};">{metrics.ram.pressureLevel.toUpperCase()}</span>
            {/if}
          </div>
          <div class="pressure-gauge">
            <div class="pressure-fill" style="width:{dispPressure}%;background:{pressureColor(metrics?.ram.pressureLevel ?? 'nominal')};box-shadow:0 0 12px {pressureColor(metrics?.ram.pressureLevel ?? 'nominal')};"></div>
          </div>
          <div class="pressure-scale"><span>Nominal</span><span>Warn</span><span>Critical</span></div>
          <div class="kv-grid" style="margin-top:0.4rem;">
            <div class="kv"><span class="kv-k">Available</span><span class="kv-v" style="color:var(--color-success);">{fmtBytes(metrics?.ram.available ?? 0)}</span></div>
            <div class="kv"><span class="kv-k">Used</span><span class="kv-v">{fmtBytes(metrics?.ram.used ?? 0)}</span></div>
            <div class="kv"><span class="kv-k">Total</span><span class="kv-v">{fmtBytes(metrics?.ram.total ?? 0)}</span></div>
            <div class="kv"><span class="kv-k">Swap</span><span class="kv-v" style="color:{(metrics?.ram.swapUsed ?? 0) > 500*1024*1024 ? 'var(--color-warning)' : 'var(--color-text)'};">{fmtBytes(metrics?.ram.swapUsed ?? 0)}</span></div>
          </div>
        {/snippet}
      </MetricCard>

      <!-- Memory Composition -->
      <MetricCard label="Memory Breakdown" index={5}>
        {#snippet icon()}<IconComponents size={26} />{/snippet}
        {#snippet children()}
          <div class="stacked-bar">
            {#if metrics}
              <div class="stacked-seg" style="width:{(metrics.ram.appAlloc / metrics.ram.total) * 100}%;background:var(--color-accent);" title="App"></div>
              <div class="stacked-seg" style="width:{(metrics.ram.wired / metrics.ram.total) * 100}%;background:var(--color-accent-secondary);" title="Wired"></div>
              <div class="stacked-seg" style="width:{(metrics.ram.compressed / metrics.ram.total) * 100}%;background:var(--color-accent-cyan);" title="Compressed"></div>
              <div class="stacked-seg" style="width:{(metrics.ram.cached / metrics.ram.total) * 100}%;background:rgba(var(--accent-3-rgb),0.4);" title="Cached"></div>
            {/if}
          </div>
          <div class="legend-col">
            <span><span class="legend-dot" style="background:var(--color-accent);"></span>App {fmtBytes(metrics?.ram.appAlloc ?? 0)}</span>
            <span><span class="legend-dot" style="background:var(--color-accent-secondary);"></span>Wired {fmtBytes(metrics?.ram.wired ?? 0)}</span>
            <span><span class="legend-dot" style="background:var(--color-accent-cyan);"></span>Compressed {fmtBytes(metrics?.ram.compressed ?? 0)}</span>
            <span><span class="legend-dot" style="background:rgba(var(--accent-3-rgb),0.5);"></span>Cached {fmtBytes(metrics?.ram.cached ?? 0)}</span>
          </div>
          <div class="card-divider"></div>
          <div class="card-section-label">Pressure History</div>
          <Sparkline series={[{ data: ramPressureHist, color: A2, fill: true }]} max={100} height={40} />
        {/snippet}
      </MetricCard>

      <!-- Storage -->
      <MetricCard label="Storage" index={6}>
        {#snippet icon()}<IconDatabase size={26} />{/snippet}
        {#snippet children()}
          <div class="big-metric">
            <span class="big-number">{dispDisk.toFixed(0)}<span class="big-unit">%</span></span>
            <span class="big-side">{fmtBytes(metrics?.disk.free ?? 0)} free</span>
          </div>
          <div class="usage-bar">
            <div class="usage-fill" style="width:{dispDisk}%;background:{(metrics?.disk.usePct ?? 0) > 90 ? 'var(--color-error)' : 'linear-gradient(90deg,var(--color-accent),var(--color-accent-secondary))'};box-shadow:0 0 12px var(--color-accent-glow);"></div>
          </div>
          <div class="kv-grid" style="margin-top:0.4rem;">
            <div class="kv"><span class="kv-k">Used</span><span class="kv-v">{fmtBytes(metrics?.disk.used ?? 0)}</span></div>
            <div class="kv"><span class="kv-k">Total</span><span class="kv-v">{fmtBytes(metrics?.disk.total ?? 0)}</span></div>
            <div class="kv"><span class="kv-k">Type</span><span class="kv-v">{metrics?.disk.type ?? "SSD"}</span></div>
            <div class="kv"><span class="kv-k">Health</span><span class="kv-v" style="color:{metrics?.disk.health === 'normal' ? 'var(--color-success)' : 'var(--color-warning)'};">● {metrics?.disk.health ?? "normal"}</span></div>
          </div>
        {/snippet}
      </MetricCard>

      <!-- Disk I/O -->
      <MetricCard label="Disk I/O" index={7}>
        {#snippet icon()}<IconExchange size={26} />{/snippet}
        {#snippet children()}
          <div class="dual-metric">
            <div class="dual-item">
              <span class="dual-arrow down">↓</span>
              <span class="dual-val">{fmtRate(metrics?.disk.readSec ?? 0)}</span>
              <span class="dual-label">Read</span>
            </div>
            <div class="dual-item">
              <span class="dual-arrow up">↑</span>
              <span class="dual-val">{fmtRate(metrics?.disk.writeSec ?? 0)}</span>
              <span class="dual-label">Write</span>
            </div>
          </div>
          <Sparkline series={[
            { data: diskReadHist, color: A3, fill: true },
            { data: diskWriteHist, color: A },
          ]} max={diskIOMax()} height={50} />
          <div class="legend-row">
            <span><span class="legend-dot" style="background:{A3};"></span>Read</span>
            <span><span class="legend-dot" style="background:{A};"></span>Write</span>
            <span style="margin-left:auto;color:var(--color-muted);">{#if metrics}{metrics.disk.readOpsSec + metrics.disk.writeOpsSec}{/if} IOPS</span>
          </div>
        {/snippet}
      </MetricCard>

      <!-- Network Throughput -->
      <MetricCard label="Network" index={8}>
        {#snippet icon()}<IconNetwork size={26} />{/snippet}
        {#snippet children()}
          <div class="dual-metric">
            <div class="dual-item">
              <span class="dual-arrow down">↓</span>
              <span class="dual-val">{fmtRate(metrics?.net.rxSec ?? 0)}</span>
              <span class="dual-label">Download</span>
            </div>
            <div class="dual-item">
              <span class="dual-arrow up">↑</span>
              <span class="dual-val">{fmtRate(metrics?.net.txSec ?? 0)}</span>
              <span class="dual-label">Upload</span>
            </div>
          </div>
          <Sparkline series={[
            { data: netRxHist, color: A3, fill: true },
            { data: netTxHist, color: A },
          ]} max={netMaxVal()} height={50} />
          <div class="legend-row">
            <span><span class="legend-dot" style="background:{A3};"></span>Download</span>
            <span><span class="legend-dot" style="background:{A};"></span>Upload</span>
          </div>
        {/snippet}
      </MetricCard>

      <!-- Network Details -->
      <MetricCard label="Connection" index={9}>
        {#snippet icon()}<IconWifi size={26} />{/snippet}
        {#snippet children()}
          <div class="kv-grid">
            <div class="kv"><span class="kv-k">Interface</span><span class="kv-v">{metrics?.net.iface ?? "—"}</span></div>
            <div class="kv"><span class="kv-k">Type</span><span class="kv-v">{metrics?.net.ifaceType ?? "—"}</span></div>
            <div class="kv"><span class="kv-k">IPv4</span><span class="kv-v">{metrics?.net.ip4 || "—"}</span></div>
            <div class="kv"><span class="kv-k">MTU</span><span class="kv-v">{metrics?.net.mtu ?? "—"}</span></div>
          </div>
          {#if metrics?.net.ifaceType === "wireless" && metrics.net.signalStrength != null}
            <div class="card-divider"></div>
            <div style="display:flex;align-items:center;gap:0.5rem;">
              <span class="card-section-label" style="margin:0;">Signal</span>
              <div class="signal-bars">
                {#each Array(4) as _, i}
                  <div class="bar {i < signalBars(metrics!.net.signalStrength) ? 'active' : ''}" style="height: {4 + i * 2.5}px"></div>
                {/each}
              </div>
              <span style="font-size:0.75rem;font-weight:600;color:var(--color-text);">{metrics.net.signalStrength} dBm</span>
            </div>
          {/if}
          <div class="card-divider"></div>
          <div style="display:flex;align-items:center;justify-content:space-between;">
            <span class="card-section-label" style="margin:0;">Latency</span>
            <span style="font-size:1rem;font-weight:700;color:{(metrics?.net.latency ?? 0) > 200 ? 'var(--color-error)' : (metrics?.net.latency ?? 0) > 100 ? 'var(--color-warning)' : 'var(--color-success)'};">
              {#if metrics?.net.latency != null}{metrics.net.latency.toFixed(0)}ms{:else}—{/if}
            </span>
          </div>
          {#if latencyHist.length > 2}
            <Sparkline series={[{ data: latencyHist, color: A2, fill: true }]} max={Math.max(1, ...latencyHist) * 1.3} height={30} />
          {/if}
        {/snippet}
      </MetricCard>

      <!-- Network Packets -->
      <MetricCard label="Packets & Errors" index={10}>
        {#snippet icon()}<IconAlertCircle size={26} />{/snippet}
        {#snippet children()}
          <div class="kv-grid">
            <div class="kv"><span class="kv-k">RX Packets</span><span class="kv-v">{fmtPackets(metrics?.net.rxPackets ?? 0)}</span></div>
            <div class="kv"><span class="kv-k">TX Packets</span><span class="kv-v">{fmtPackets(metrics?.net.txPackets ?? 0)}</span></div>
            <div class="kv"><span class="kv-k">RX Errors</span><span class="kv-v" style="color:{(metrics?.net.rxErrors ?? 0) > 0 ? 'var(--color-error)' : 'var(--color-success)'};">{metrics?.net.rxErrors ?? 0}</span></div>
            <div class="kv"><span class="kv-k">TX Errors</span><span class="kv-v" style="color:{(metrics?.net.txErrors ?? 0) > 0 ? 'var(--color-error)' : 'var(--color-success)'};">{metrics?.net.txErrors ?? 0}</span></div>
            <div class="kv"><span class="kv-k">RX Drops</span><span class="kv-v" style="color:{(metrics?.net.rxDrops ?? 0) > 0 ? 'var(--color-error)' : 'var(--color-success)'};">{metrics?.net.rxDrops ?? 0}</span></div>
            <div class="kv"><span class="kv-k">TX Drops</span><span class="kv-v" style="color:{(metrics?.net.txDrops ?? 0) > 0 ? 'var(--color-error)' : 'var(--color-success)'};">{metrics?.net.txDrops ?? 0}</span></div>
          </div>
          <div class="card-divider"></div>
          <div class="kv-grid">
            <div class="kv"><span class="kv-k">Total ↓</span><span class="kv-v">{fmtBytes(metrics?.net.totalRx ?? 0)}</span></div>
            <div class="kv"><span class="kv-k">Total ↑</span><span class="kv-v">{fmtBytes(metrics?.net.totalTx ?? 0)}</span></div>
          </div>
        {/snippet}
      </MetricCard>

      <!-- GPU -->
      {#if metrics?.gpu}
        <MetricCard label="GPU" index={11}>
        {#snippet icon()}<IconBox size={26} />{/snippet}
          {#snippet children()}
            <div class="big-metric">
              <span class="big-number">{#if metrics.gpu.usage != null}{metrics.gpu.usage.toFixed(0)}<span class="big-unit">%</span>{:else}—{/if}</span>
              {#if metrics.gpu.temp != null}
                <span class="big-side" style="color:{tempColor(metrics.gpu.temp)};">{metrics.gpu.temp.toFixed(0)}°C</span>
              {/if}
            </div>
            <div class="card-sub" style="font-size:0.625rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">{metrics.gpu.name}{#if metrics.gpu.cores} · {metrics.gpu.cores} cores{/if}</div>
            {#if metrics.gpu.usage != null}
              <div class="usage-bar" style="margin-top:0.3rem;">
                <div class="usage-fill" style="width:{metrics.gpu.usage}%;"></div>
              </div>
            {/if}
            {#if gpuHist.length > 2}
              <Sparkline series={[{ data: gpuHist, color: A, fill: true }]} max={100} height={40} />
            {/if}
            <div class="kv-grid" style="margin-top:0.3rem;">
              {#if metrics.gpu.cores != null}
                <div class="kv"><span class="kv-k">Cores</span><span class="kv-v">{metrics.gpu.cores}</span></div>
              {/if}
              {#if metrics.gpu.powerDraw != null}
                <div class="kv"><span class="kv-k">Power</span><span class="kv-v">{metrics.gpu.powerDraw.toFixed(2)}W</span></div>
              {/if}
              {#if metrics.gpu.memTotal != null}
                <div class="kv"><span class="kv-k">VRAM</span><span class="kv-v">{#if metrics.gpu.memUsed != null}{fmtBytes(metrics.gpu.memUsed * 1024 * 1024)}{/if} / {fmtBytes(metrics.gpu.memTotal * 1024 * 1024)}</span></div>
              {/if}
            </div>
          {/snippet}
        </MetricCard>
      {/if}

      <!-- NPU / Neural Engine -->
      {#if metrics?.npu}
        <MetricCard label="Neural Engine" index={14}>
          {#snippet icon()}<IconComponents size={26} />{/snippet}
          {#snippet children()}
            <div class="big-metric">
              <span class="big-number">{#if metrics.npu.powerDraw != null}{metrics.npu.powerDraw.toFixed(2)}<span class="big-unit">W</span>{:else}—{/if}</span>
              {#if metrics.npu.powerDraw != null && metrics.npu.powerDraw > 0}
                <span class="big-side" style="color:var(--color-accent-cyan);">ACTIVE</span>
              {:else}
                <span class="big-side" style="color:var(--color-muted);">IDLE</span>
              {/if}
            </div>
            <div class="card-sub" style="font-size:0.625rem;">{metrics.npu.name}</div>
            {#if metrics.power}
              <div class="card-divider"></div>
              <div class="card-section-label">Power Breakdown</div>
              <div class="power-bar">
                {#if metrics.power.cpuPower != null}
                  <div class="power-seg cpu" style="width:{(metrics.power.cpuPower / (metrics.power.combined ?? 1)) * 100}%;" title="CPU {metrics.power.cpuPower.toFixed(1)}W"></div>
                {/if}
                {#if metrics.power.gpuPower != null}
                  <div class="power-seg gpu" style="width:{(metrics.power.gpuPower / (metrics.power.combined ?? 1)) * 100}%;" title="GPU {metrics.power.gpuPower.toFixed(1)}W"></div>
                {/if}
                {#if metrics.power.anePower != null}
                  <div class="power-seg ane" style="width:{Math.max(2, (metrics.power.anePower / (metrics.power.combined ?? 1)) * 100)}%;" title="ANE {metrics.power.anePower.toFixed(1)}W"></div>
                {/if}
              </div>
              <div class="kv-grid" style="margin-top:0.3rem;">
                <div class="kv"><span class="kv-k">CPU</span><span class="kv-v">{#if metrics.power.cpuPower != null}{metrics.power.cpuPower.toFixed(2)}W{/if}</span></div>
                <div class="kv"><span class="kv-k">GPU</span><span class="kv-v">{#if metrics.power.gpuPower != null}{metrics.power.gpuPower.toFixed(2)}W{/if}</span></div>
                <div class="kv"><span class="kv-k">ANE</span><span class="kv-v">{#if metrics.power.anePower != null}{metrics.power.anePower.toFixed(2)}W{/if}</span></div>
                <div class="kv"><span class="kv-k">Total</span><span class="kv-v" style="color:var(--color-accent);">{#if metrics.power.combined != null}{metrics.power.combined.toFixed(2)}W{/if}</span></div>
              </div>
            {/if}
          {/snippet}
        </MetricCard>
      {/if}

      <!-- Top Processes -->
      <MetricCard label="Top Processes" index={12}>
        {#snippet icon()}<IconCircleDot size={26} />{/snippet}
        {#snippet children()}
          <div class="proc-tabs">
            <button class="proc-tab {procSort === 'cpu' ? 'active' : ''}" onclick={() => procSort = "cpu"}>CPU</button>
            <button class="proc-tab {procSort === 'mem' ? 'active' : ''}" onclick={() => procSort = "mem"}>Memory</button>
          </div>
          <ProcList
            items={sortedProcs().map(p => ({
              label: p.name, value: procSort === "cpu" ? p.cpu : p.mem,
              sub: procSort === "cpu" ? `${p.mem.toFixed(0)}MB` : `${p.cpu.toFixed(1)}%`, pid: p.pid,
            }))}
            max={procSort === "cpu" ? 100 : Math.max(1, ...(metrics?.cpu.topProcesses.map(p => p.mem) ?? [1]))}
          />
        {/snippet}
      </MetricCard>

      <!-- Events -->
      <MetricCard label="Events" index={13}>
        {#snippet icon()}<IconClock size={26} />{/snippet}
        {#snippet children()}
          {#if events.length === 0}
            <div class="empty-state">No events. Monitoring…</div>
          {:else}
            <div class="events-list">
              {#each events as ev}
                <div class="event-row {ev.level}">
                  <span class="event-time">{ev.time}</span>
                  <span class="event-icon">{ev.level === "critical" ? "🔴" : ev.level === "warn" ? "⚠" : "•"}</span>
                  <span class="event-msg">{ev.msg}</span>
                </div>
              {/each}
            </div>
          {/if}
        {/snippet}
      </MetricCard>
  </div>

  <footer class="dash-footer">
    <div><span class="dot"></span>Live · 1.5s · {metrics?.kernel ?? ""}</div>
    <div>{metrics?.distro ?? ""}</div>
  </footer>
</div>
