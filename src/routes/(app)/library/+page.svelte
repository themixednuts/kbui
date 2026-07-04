<script lang="ts">
  import { Card, CardContent, CardHeader, CardTitle } from "$lib/components/ui/card/index.js";
</script>

<section class="app-route-page">
  <div class="route-heading">
    <span>Wave 0d</span>
    <h2>Library</h2>
  </div>

  <Card class="max-w-[520px]">
    <CardHeader>
      <CardTitle>Library</CardTitle>
    </CardHeader>
    <CardContent>
      <p>Library &mdash; rebuilt in a later wave.</p>
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

  p {
    margin: 0;
    color: var(--ink-2);
  }
</style>
