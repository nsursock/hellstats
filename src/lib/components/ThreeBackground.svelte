<script lang="ts">
  import { onMount } from "svelte";
  import * as THREE from "three";
  import { themeStore, type ThemeId } from "../themes.svelte";

  let { enabled = true }: { enabled?: boolean } = $props();

  let canvas: HTMLCanvasElement | null = $state(null);
  let renderer: THREE.WebGLRenderer | null = null;
  let animationId: number | null = null;
  let scene: THREE.Scene;
  let camera: THREE.PerspectiveCamera;
  let particles: THREE.Points | null = null;
  let grid: THREE.GridHelper | null = null;
  let currentTheme: ThemeId = themeStore.current;

  function paletteFor(theme: ThemeId) {
    if (theme === "ghibli") {
      return {
        colors: [[0.29, 0.55, 0.44], [0.42, 0.64, 0.84], [0.84, 0.63, 0.23], [0.94, 0.90, 0.80]],
        weights: [0.35, 0.3, 0.2, 0.15],
        gridA: 0x4a8b6f, gridB: 0xa89a7a, gridOpacity: 0.18,
        blending: THREE.NormalBlending, opacity: 0.55, size: 0.7, rotSpeed: 0.0003,
      };
    }
    if (theme === "fiesta") {
      return {
        colors: [[1.0, 0.0, 0.43], [1.0, 0.75, 0.04], [0.98, 0.34, 0.03], [0.51, 0.22, 0.93], [0.23, 0.53, 1.0]],
        weights: [0.28, 0.22, 0.2, 0.17, 0.13],
        gridA: 0xff006e, gridB: 0x8338ec, gridOpacity: 0.32,
        blending: THREE.AdditiveBlending, opacity: 0.65, size: 0.55, rotSpeed: 0.0006,
      };
    }
    if (theme === "dawn") {
      return {
        colors: [[1.0, 0.49, 0.42], [0.42, 0.56, 0.84], [0.83, 0.63, 0.09], [0.55, 0.44, 0.71]],
        weights: [0.3, 0.3, 0.2, 0.2],
        gridA: 0xff7e6b, gridB: 0x6b8fd6, gridOpacity: 0.15,
        blending: THREE.NormalBlending, opacity: 0.5, size: 0.65, rotSpeed: 0.0003,
      };
    }
    if (theme === "synthwave84") {
      return {
        colors: [[1.0, 0.49, 0.86], [0.21, 0.98, 0.96], [1.0, 0.87, 0.36]],
        weights: [0.4, 0.35, 0.25],
        gridA: 0xff7edb, gridB: 0x848bbd, gridOpacity: 0.3,
        blending: THREE.AdditiveBlending, opacity: 0.6, size: 0.5, rotSpeed: 0.0005,
      };
    }
    if (theme === "solarizedDark") {
      return {
        colors: [[0.15, 0.55, 0.82], [0.16, 0.63, 0.6], [0.71, 0.54, 0.0], [0.79, 0.29, 0.08]],
        weights: [0.3, 0.3, 0.2, 0.2],
        gridA: 0x268bd2, gridB: 0x586e75, gridOpacity: 0.2,
        blending: THREE.AdditiveBlending, opacity: 0.5, size: 0.6, rotSpeed: 0.0004,
      };
    }
    // retrowave
    return {
      colors: [[1.0, 0.18, 0.6], [0.5, 0.2, 1.0], [0.2, 0.9, 1.0]],
      weights: [0.4, 0.3, 0.3],
      gridA: 0xff2e9a, gridB: 0x7a6aa8, gridOpacity: 0.3,
      blending: THREE.AdditiveBlending, opacity: 0.6, size: 0.5, rotSpeed: 0.0005,
    };
  }

  function pickWeighted(weights: number[]) {
    const r = Math.random();
    let acc = 0;
    for (let i = 0; i < weights.length; i++) {
      acc += weights[i];
      if (r <= acc) return i;
    }
    return weights.length - 1;
  }

  function init() {
    if (!canvas) return;
    const pal = paletteFor(currentTheme);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 50;

    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

    const particleCount = 600;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    for (let i = 0; i < particleCount; i++) {
      const i3 = i * 3;
      positions[i3] = (Math.random() - 0.5) * 200;
      positions[i3 + 1] = (Math.random() - 0.5) * 200;
      positions[i3 + 2] = (Math.random() - 0.5) * 200;
      const c = pal.colors[pickWeighted(pal.weights)];
      colors[i3] = c[0]; colors[i3 + 1] = c[1]; colors[i3 + 2] = c[2];
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const material = new THREE.PointsMaterial({
      size: pal.size, vertexColors: true, transparent: true,
      opacity: pal.opacity, blending: pal.blending, depthWrite: false,
    });
    particles = new THREE.Points(geometry, material);
    scene.add(particles);

    const gridHelper = new THREE.GridHelper(200, 40, pal.gridA, pal.gridB);
    gridHelper.position.y = -30;
    (gridHelper.material as THREE.Material).transparent = true;
    (gridHelper.material as THREE.Material).opacity = pal.gridOpacity;
    scene.add(gridHelper);
    grid = gridHelper;

    animate(0);
  }

  let lastRender = 0;
  const FRAME_INTERVAL = 1000 / 10; // 10fps — background is decorative
  let isVisible = true;

  function animate(ts: number) {
    animationId = requestAnimationFrame(animate);
    if (!isVisible) return;
    if (ts - lastRender < FRAME_INTERVAL) return;
    lastRender = ts;
    const pal = paletteFor(currentTheme);
    if (particles) {
      particles.rotation.y += pal.rotSpeed * 4; // compensate for fewer frames
      particles.rotation.x += pal.rotSpeed * 0.4 * 4;
    }
    if (renderer && camera) {
      const t = Date.now() * 0.0001;
      camera.position.x = Math.sin(t) * 5;
      camera.position.y = Math.cos(t * 0.7) * 3;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
    }
  }

  function dispose() {
    if (animationId) cancelAnimationFrame(animationId);
    if (particles) { particles.geometry.dispose(); (particles.material as THREE.Material).dispose(); particles = null; }
    if (grid) { grid.geometry.dispose(); (grid.material as THREE.Material).dispose(); grid = null; }
    if (renderer) { renderer.dispose(); renderer = null; }
  }

  function onResize() {
    if (renderer && camera) {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }
  }

  function onVisibility() {
    isVisible = !document.hidden;
  }

  onMount(() => {
    if (enabled) init();
    window.addEventListener("resize", onResize);
    document.addEventListener("visibilitychange", onVisibility);
    return () => { dispose(); window.removeEventListener("resize", onResize); document.removeEventListener("visibilitychange", onVisibility); };
  });

  $effect(() => {
    const themeVal = themeStore.current;
    void themeVal;
    if (renderer && themeVal !== currentTheme) {
      dispose();
      currentTheme = themeVal;
      if (enabled) init();
    }
  });

  // Handle enable/disable toggle
  $effect(() => {
    if (enabled && !renderer && canvas) {
      init();
    } else if (!enabled && renderer) {
      dispose();
    }
  });
</script>

{#if enabled}
  <canvas id="three-bg" bind:this={canvas}></canvas>
{/if}
