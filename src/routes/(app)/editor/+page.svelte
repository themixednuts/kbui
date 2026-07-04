<script lang="ts">
  import { KeyboardBoard } from "$lib/components/board";
  import { Card, CardContent, CardHeader, CardTitle } from "$lib/components/ui/card/index.js";
  import { cloneDevice, sampleKeyboard } from "$lib/keyboard/schema";

  const previewProfile = cloneDevice(sampleKeyboard);

  let selectedKeyId = $state("k2-4");
  const selectedKeys = $derived([selectedKeyId]);
</script>

<section class="app-route-page">
  <div class="route-heading">
    <span>Wave 0d</span>
    <h2>Editor</h2>
  </div>

  <Card class="max-w-[520px]">
    <CardHeader>
      <CardTitle>Editor</CardTitle>
    </CardHeader>
    <CardContent>
      <p>Editor &mdash; rebuilt in a later wave.</p>
    </CardContent>
  </Card>

  <Card class="min-h-[460px]">
    <CardHeader>
      <CardTitle>Keyboard Preview</CardTitle>
    </CardHeader>
    <CardContent class="min-h-[390px] p-0">
      <div class="board-preview">
        <KeyboardBoard
          profile={previewProfile}
          activeLayer="base"
          lens="keys"
          selection={selectedKeys}
          marked={["k1-1", "k1-2"]}
          onSelectKey={(keyId) => (selectedKeyId = keyId)}
        />
      </div>
    </CardContent>
  </Card>
</section>

<style>
  .app-route-page {
    display: grid;
    gap: 18px;
    align-content: start;
    min-height: 100%;
    padding: 24px;
  }

  .route-heading {
    display: grid;
    gap: 4px;
  }

  .route-heading span {
    color: var(--ink-3);
    font-family: var(--mono);
    font-size: 10px;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }

  .route-heading h2 {
    margin: 0;
    font-size: 30px;
    line-height: 1.1;
  }

  .board-preview {
    display: flex;
    min-height: 390px;
    overflow: hidden;
    background: var(--paper);
  }

  p {
    margin: 0;
    color: var(--ink-2);
  }
</style>
