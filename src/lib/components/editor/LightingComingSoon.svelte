<script lang="ts">
  import { Lightbulb, Paintbrush } from "@lucide/svelte";

  import type { EditorStore } from "$lib/app/editor-store.svelte";
  import Button from "$lib/components/ui/Button.svelte";

  type Props = {
    editor: EditorStore;
  };

  let { editor }: Props = $props();
</script>

<section class="lighting-panel" aria-label="Lighting lens">
  <div class="lighting-mark">
    <Lightbulb size={24} aria-hidden="true" />
  </div>
  <div>
    <span class="eyebrow">Lighting lens</span>
    <h2>Coming soon</h2>
    <p>Per-key paint, global RGB effects, and drag selection land in Wave 1b.</p>
  </div>
  <Button variant="ghost" onclick={() => editor.setLens("keys")}>
    <Paintbrush size={15} aria-hidden="true" />
    Back to keys
  </Button>
</section>

<style>
  .lighting-panel {
    display: grid;
    grid-template-columns: 54px minmax(0, 1fr) auto;
    gap: 16px;
    align-items: center;
    min-height: 260px;
    padding: 22px;
    border: 1px solid var(--line);
    border-radius: 12px;
    background:
      linear-gradient(135deg, color-mix(in oklch, var(--teal) 10%, transparent), transparent 48%),
      color-mix(in oklch, var(--surface) 78%, transparent);
    box-shadow: var(--shadow-card);
  }

  .lighting-mark {
    display: grid;
    width: 54px;
    height: 54px;
    place-items: center;
    border: 1px solid color-mix(in oklch, var(--teal) 44%, transparent);
    border-radius: 12px;
    background: color-mix(in oklch, var(--teal) 16%, var(--surface));
    color: var(--teal-ink);
  }

  .eyebrow {
    color: var(--ink-3);
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }

  h2 {
    margin: 2px 0 0;
    font-size: 18px;
    line-height: 1.1;
  }

  p {
    max-width: 48ch;
    margin: 6px 0 0;
    color: var(--ink-2);
    font-size: 12px;
    line-height: 1.45;
  }

  @media (max-width: 680px) {
    .lighting-panel {
      grid-template-columns: minmax(0, 1fr);
      align-items: start;
    }
  }
</style>
