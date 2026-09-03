<script lang="ts">
  import { themeStore, THEME_IDS, THEMES } from "../themes.svelte";
  import { IconPalette, IconCheck } from "@tabler/icons-svelte";

  let open = $state(false);

  function select(id: typeof THEME_IDS[number]) {
    themeStore.set(id);
    open = false;
  }
</script>

<div class="theme-switcher">
  <button
    class="icon-btn {open ? 'active' : ''}"
    onclick={() => open = !open}
    title="Switch Visual Theme"
    aria-label="Switch Theme"
  >
    <IconPalette size={24} />
  </button>

  {#if open}
    <div class="theme-backdrop" onclick={() => open = false} onkeydown={(e) => e.key === "Escape" && (open = false)} role="button" tabindex="-1" aria-label="Close menu"></div>
    <div class="theme-menu">
      <div class="theme-header">Palette Engine</div>
      {#each THEME_IDS as id (id)}
        {@const isActive = themeStore.current === id}
        <button class="theme-item {isActive ? 'active' : ''}" onclick={() => select(id)}>
          <div class="theme-swatches">
            {#each THEMES[id].swatches as sw}
              <div class="theme-swatch" style="background: {sw};"></div>
            {/each}
          </div>
          <span class="theme-name">{THEMES[id].name}</span>
          {#if isActive}
            <IconCheck size={16} style="color: var(--color-accent); margin-left: auto;" />
          {/if}
        </button>
      {/each}
    </div>
  {/if}
</div>
