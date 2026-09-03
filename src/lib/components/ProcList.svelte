<script lang="ts">
  let {
    items = [] as { label: string; value: number; sub?: string; pid?: number }[],
    max = 100,
    valueLabel = "CPU",
  }: { items?: { label: string; value: number; sub?: string; pid?: number }[]; max?: number; valueLabel?: string } = $props();
</script>

<div class="proc-list">
  {#each items as item}
    <div class="proc-row" title="{item.pid ? `PID: ${item.pid}` : ''} {item.label}">
      <span class="proc-name">{item.label}</span>
      <div class="proc-bar-track">
        <div class="proc-bar-fill" style="width: {Math.min(100, (item.value / max) * 100)}%"></div>
      </div>
      <span class="proc-val">{item.value.toFixed(1)}%{#if item.sub}<span class="proc-sub"> {item.sub}</span>{/if}</span>
    </div>
  {/each}
</div>

<style>
  .proc-list { display: flex; flex-direction: column; gap: 0.2rem; }
  .proc-row { display: flex; align-items: center; gap: 0.4rem; font-size: 0.625rem; }
  .proc-name { width: 7rem; color: var(--color-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0; }
  .proc-bar-track { flex: 1; height: 4px; border-radius: 2px; background: rgba(var(--muted-rgb), 0.15); overflow: hidden; }
  .proc-bar-fill { height: 100%; border-radius: 2px; background: linear-gradient(90deg, var(--color-accent), var(--color-accent-secondary)); box-shadow: 0 0 6px var(--color-accent-glow); transition: width 0.4s ease; }
  .proc-val { width: 4.5rem; text-align: right; color: var(--color-muted); flex-shrink: 0; }
  .proc-sub { color: var(--color-muted); opacity: 0.6; }
</style>
