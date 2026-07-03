<!-- htmlswap: requires svelte@^5.56.4 -->
<script lang="ts">
	let { browse = [], group = [], map = [], previewRow = [] }: { browse?: any; group?: any; map?: any; previewRow?: any } = $props();
	function __htmlswap_style(value: any): string {
		if (value == null || value === false) return '';
		if (typeof value === 'string') return value;
		if (typeof value !== 'object') return String(value);
		return Object.entries(value).filter(([, item]) => item != null && item !== false).map(([key, item]) => `${__htmlswap_kebab(key)}:${String(item)}`).join(';');
	}
	function __htmlswap_kebab(value: string): string {
		return value.replace(/[A-Z]/g, (ch) => `-${ch.toLowerCase()}`);
	}
</script>
<svelte:head>
	<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200">
</svelte:head>
<style>
	.hs_0.browse-tag:hover:hover {
		border-color: var(--ink-3);
	}
	.hs_1.btn[data-htmlswap-tone="neutral"][data-htmlswap-variant="ghost"]:hover:hover {
		background: var(--surface-2);
		color: var(--ink);
	}
	.hs_2.btn[data-htmlswap-tone="accent"][data-htmlswap-variant="solid"]:hover:hover {
		background: oklch(68% .18 32);
	}
	.hs_3.place-x:hover:hover {
		background: #00000014;
	}
	.hs_4.btn[data-htmlswap-tone="accent"][data-htmlswap-variant="solid"]:hover:hover {
		background: oklch(68% .18 32);
	}
	.hs_5.btn[data-htmlswap-tone="neutral"][data-htmlswap-variant="ghost"]:hover:hover {
		background: var(--surface-2);
		color: var(--ink);
	}
</style>
<!-- htmlswap-css-comment:  ============================================================
   Klakson — QMK/ZMK GUI design system
   Rebuilt to the htmlswap .dc.html grammar:
   - layout is FLEXBOX ONLY (no grid, no absolute/fixed/sticky,
     no z-index, no float, no inline-block)
   - buttons/tabs/switches are driven by semantic intent markers
     (data-htmlswap-tone / -variant / -size) + ARIA state
   - icons are Material Symbol spans
   Transitions are kept for the browser preview; the compiler
   drops them losslessly to source comments.
   ============================================================  -->
<!-- htmlswap-css-comment:  surfaces — warm paper, a touch cleaner for a native-desktop feel  -->
<!-- htmlswap-css-comment:  accents — one chroma/lightness, hue varies (per aesthetic rules)  -->
<!-- htmlswap-css-comment:  ============ APP FRAME (flex column) ============  -->
<!-- htmlswap-css-comment:  ============ TOPBAR ============  -->
<!-- htmlswap-css-comment:  ============ BUTTONS (semantic-driven) ============  -->
<!-- htmlswap-css-comment:  neutral  -->
<!-- htmlswap-css-comment:  accent  -->
<!-- htmlswap-css-comment:  danger  -->
<!-- htmlswap-css-comment:  ============ CHIP ============  -->
<!-- htmlswap-css-comment:  ============ LAYER CHIPS ============  -->
<!-- htmlswap-css-comment:  ============ CARD ============  -->
<!-- htmlswap-css-comment:  ============ INPUTS ============  -->
<!-- htmlswap-css-comment:  ============ SEGMENTED TABS (role=tablist) ============  -->
<!-- htmlswap-css-comment:  ============ SWITCH (role=switch, flexbox knob) ============  -->
<!-- htmlswap-css-comment:  ============ KEYCAP ============  -->
<!-- htmlswap-css-comment:  lighting lens  -->
<!-- htmlswap-css-comment:  ============ KEYBOARD LAYOUT ============  -->
<!-- htmlswap-css-comment:  ============ LED SWATCHES ============  -->
<!-- htmlswap-css-comment:  ============ LED CHIP (inspector hero) ============  -->
<!-- htmlswap-css-comment:  ============ INSPECTOR ============  -->
<!-- htmlswap-css-comment:  keycode picker  -->
<!-- htmlswap-css-comment:  ============ SLIDER ROW ============  -->
<!-- htmlswap-css-comment:  ============ ROWS / DIVIDERS / TAGS ============  -->
<!-- htmlswap-css-comment:  ============ LIST ROW (settings, files, etc) ============  -->
<!-- htmlswap-css-comment:  ============ DIFF ============  -->
<!-- htmlswap-css-comment:  changed-files list  -->
<!-- htmlswap-css-comment:  ============ VERSION TIMELINE (flexbox rail, no absolute) ============  -->
<!-- htmlswap-css-comment:  ============ SEQUENCE KEYS (macros/combos) ============  -->
<!-- htmlswap-css-comment:  ============ LIGHTING ============  -->
<!-- htmlswap-css-comment:  ============ DEVICE / OPTION CARDS ============  -->
<!-- htmlswap-css-comment:  ============ BUILD LOG ============  -->
<!-- htmlswap-css-comment:  ============ CONNECT HERO ============  -->
<!-- htmlswap-css-comment:  ============ SCROLLBAR ============  -->
<!-- htmlswap-css-comment:  ============ APP SHELL ============  -->
<!-- htmlswap-css-comment:  nav rail  -->
<!-- htmlswap-css-comment:  profile popover  -->
<!-- htmlswap-css-comment:  app top bar  -->
<!-- htmlswap-css-comment:  place banner  -->
<!-- htmlswap-css-comment:  combo pick bar (in editor)  -->
<!-- htmlswap-css-comment:  toast  -->
<!-- htmlswap-css-comment:  change list  -->
<!-- htmlswap-css-comment:  flash overlay / modal  -->
<!-- htmlswap-css-comment:  ============ BROWSE ============  -->
<!-- htmlswap-css-comment:  ============ LIGHTING SELECTION ============  -->
<!-- htmlswap-source: <section class="body" style="flex-direction: column; padding: 22px; gap: 16px;" data-htmlswap-region="community.browse"&gt; -->
<section class="body" data-htmlswap-region="community.browse" style="box-sizing: border-box; display: flex; flex: 1; min-height: 0; overflow: auto; flex-direction: column; padding: 22px; gap: 16px">
	<!-- htmlswap-source: <div class="row" style="gap: 10px; flex-wrap: wrap;"&gt; -->
	<div class="row" style="box-sizing: border-box; display: flex; align-items: center; gap: 10px; flex-wrap: wrap">
		<!-- htmlswap-source: <div class="browse-tags"&gt; -->
		<div class="browse-tags" style="box-sizing: border-box; display: flex; gap: 6px; flex-wrap: wrap">
			{#each browse.tags as tag, $index}
				<!-- htmlswap-source: <button -->
				<button class="browse-tag hs_0" id={tag.buttonId} aria-pressed={tag.selected} data-htmlswap-key={tag.value} style="box-sizing: border-box; font: inherit; cursor: pointer; border: 1px solid var(--line-2); background: var(--surface); color: var(--ink-2); padding: 5px 12px; border-radius: 999px; font-family: var(--mono); font-size: 11px; letter-spacing: .02em; text-transform: lowercase; transition: background .1s, border-color .1s" onclick={tag.select}>
					
            {tag.label}
          
				</button>
			{/each}
		</div>
		<!-- htmlswap-source: <div class="spacer"&gt;</div&gt; -->
		<div class="spacer" style="box-sizing: border-box; flex: 1">
		</div>
		{#if browse.hasDevice}
			<!-- htmlswap-source: <button -->
			<button class="btn" id="browse-compatible-only" data-htmlswap-tone="neutral" data-htmlswap-variant={browse.compatVariant} data-htmlswap-size="sm" aria-pressed={browse.compatOnly} style="box-sizing: border-box; font: inherit; cursor: pointer; border: 1px solid #0000; background: none; color: inherit; display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 29px; padding: 0 11px; border-radius: var(--r-2); font-weight: 500; font-size: 12px; white-space: nowrap; transition: background .1s, border-color .1s, color .1s" onclick={browse.toggleCompatOnly}>
				<!-- htmlswap-source: <span class="material-symbols-outlined"&gt;check</span&gt; -->
				<span class="material-symbols-outlined" style="box-sizing: border-box; font-variation-settings: &quot;FILL&quot; 0, &quot;wght&quot; 400, &quot;GRAD&quot; 0, &quot;opsz&quot; 24; font-size: 16px; line-height: 1; user-select: none; font-family: Material Symbols Outlined; font-weight: normal; font-style: normal; letter-spacing: normal; text-transform: none; display: inline-block; white-space: nowrap; word-wrap: normal; direction: ltr">
					check
				</span>
				<!-- htmlswap-source: <span&gt;{{ browse.compatLabel }}</span&gt; -->
				<span style="box-sizing: border-box">
					{browse.compatLabel}
				</span>
			</button>
		{/if}
	</div>
	<!-- htmlswap-source: <p class="muted" style="margin: 0; font-size: 12px;"&gt; -->
	<p class="muted" style="box-sizing: border-box; color: var(--ink-3); margin: 0; font-size: 12px">
		
      Shared read-only — adopt one to make your own copy you can edit and flash. Sorted by likes; no rankings, no downvotes.
    
	</p>
	<!-- htmlswap-source: <div class="browse-grid"&gt; -->
	<div class="browse-grid" style="box-sizing: border-box; display: flex; flex-wrap: wrap; gap: 16px; align-content: flex-start">
		{#each browse.maps as map, $index}
			<!-- htmlswap-source: <article class="map-card" data-htmlswap-key="{{ map.id }}"&gt; -->
			<article class="map-card" data-htmlswap-key={map.id} style="box-sizing: border-box; display: flex; flex-direction: column; width: 300px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-3); box-shadow: var(--shadow-card); overflow: hidden">
				<!-- htmlswap-source: <button -->
				<button class="map-preview" id={map.previewButtonId} title="Preview" data-htmlswap-variant="text" data-htmlswap-tone="neutral" style="box-sizing: border-box; font: inherit; cursor: pointer; border: 0; background: var(--surface-2); color: inherit; display: flex; align-items: center; justify-content: center; padding: 16px; border-bottom: 1px solid var(--line); min-height: 96px" onclick={map.preview}>
					<!-- htmlswap-source: <div class="mini-board" style="{{ map.previewStyle }}"&gt; -->
					<div class="mini-board" style={`box-sizing: border-box; transform-origin: center; ${__htmlswap_style(map.previewStyle)}`}>
						{#each map.previewRows as previewRow, $index}
							<!-- htmlswap-source: <div style="{{ previewRow.style }}" data-htmlswap-key="{{ previewRow.id }}"&gt; -->
							<div data-htmlswap-key={previewRow.id} style={`box-sizing: border-box; ${__htmlswap_style(previewRow.style)}`}>
								{#each previewRow.groups as group, $index}
									{#if group.isGap}
										<!-- htmlswap-source: <div style="{{ group.style }}" data-htmlswap-key="{{ group.id }}"&gt;</div&gt; -->
										<div data-htmlswap-key={group.id} style={`box-sizing: border-box; ${__htmlswap_style(group.style)}`}>
										</div>
									{:else}
										<!-- htmlswap-source: <div style="{{ group.style }}" data-htmlswap-key="{{ group.id }}"&gt; -->
										<div data-htmlswap-key={group.id} style={`box-sizing: border-box; ${__htmlswap_style(group.style)}`}>
											{#each group.cells as cell, $index}
												<!-- htmlswap-source: <span style="{{ cell.style }}" data-htmlswap-key="{{ cell.id }}"&gt;</span&gt; -->
												<span data-htmlswap-key={cell.id} style={`box-sizing: border-box; ${__htmlswap_style(cell.style)}`}>
												</span>
											{/each}
										</div>
									{/if}
								{/each}
							</div>
						{/each}
					</div>
				</button>
				<!-- htmlswap-source: <div class="map-info"&gt; -->
				<div class="map-info" style="box-sizing: border-box; display: flex; flex-direction: column; gap: 7px; padding: 13px 14px; flex: 1">
					<!-- htmlswap-source: <div class="row" style="gap: 8px;"&gt; -->
					<div class="row" style="box-sizing: border-box; display: flex; align-items: center; gap: 8px">
						<!-- htmlswap-source: <span class="map-name"&gt;{{ map.name }}</span&gt; -->
						<span class="map-name" style="box-sizing: border-box; font-family: var(--mono); font-size: 13px; font-weight: 600">
							{map.name}
						</span>
						{#if map.official}
							<!-- htmlswap-source: <span class="tag" style="background: var(- -ink); color: var(- -paper);"&gt;official</span&gt; -->
							<span class="tag" style="box-sizing: border-box; display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; font-family: var(--mono); font-size: 10px; text-transform: uppercase; letter-spacing: .07em; background: var(--ink); color: var(--paper)">
								official
							</span>
						{/if}
					</div>
					<!-- htmlswap-source: <div class="row" style="gap: 6px;"&gt; -->
					<div class="row" style="box-sizing: border-box; display: flex; align-items: center; gap: 6px">
						{#if map.hasAvatar}
							<!-- htmlswap-source: <img class="avatar" src="{{ map.avatarUrl }}" alt="{{ map.authorLabel }}" style="{{ map.avatarStyle }}"&gt; -->
							<img class="avatar" src={map.avatarUrl} alt={map.authorLabel} style={`box-sizing: border-box; border-radius: 999px; object-fit: cover; background: var(--surface-2); flex-shrink: 0; display: block; ${__htmlswap_style(map.avatarStyle)}`} />
						{:else}
							<!-- htmlswap-source: <span class="avatar fallback" style="{{ map.avatarStyle }}"&gt;{{ map.initials }}</span&gt; -->
							<span class="avatar fallback" style={`box-sizing: border-box; border-radius: 999px; object-fit: cover; background: var(--ink); flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-family: var(--mono); font-weight: 700; color: var(--paper); ${__htmlswap_style(map.avatarStyle)}`}>
								{map.initials}
							</span>
						{/if}
						<!-- htmlswap-source: <span class="map-by"&gt;{{ map.byline }}</span&gt; -->
						<span class="map-by" style="box-sizing: border-box; font-family: var(--mono); font-size: 10px; color: var(--ink-3)">
							{map.byline}
						</span>
					</div>
					<!-- htmlswap-source: <div class="row" style="gap: 5px; flex-wrap: wrap;"&gt; -->
					<div class="row" style="box-sizing: border-box; display: flex; align-items: center; gap: 5px; flex-wrap: wrap">
						{#each map.tags as mapTag, $index}
							<!-- htmlswap-source: <span class="tag" data-htmlswap-key="{{ mapTag.id }}"&gt;{{ mapTag.label }}</span&gt; -->
							<span class="tag" data-htmlswap-key={mapTag.id} style="box-sizing: border-box; display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; font-family: var(--mono); font-size: 10px; text-transform: uppercase; letter-spacing: .07em; background: var(--surface-2); color: var(--ink-2)">
								{mapTag.label}
							</span>
						{/each}
					</div>
					<!-- htmlswap-source: <div class="signals"&gt; -->
					<div class="signals" style="box-sizing: border-box; display: flex; align-items: center; gap: 14px; font-family: var(--mono); font-size: 11px; color: var(--ink-2)">
						<!-- htmlswap-source: <span title="Likes"&gt; -->
						<span title="Likes" style="box-sizing: border-box; display: inline-flex; align-items: center; gap: 4px">
							<!-- htmlswap-source: <span class="material-symbols-outlined" style="font-size: 14px; color: var(- -coral-ink);"&gt;favorite</span&gt; -->
							<span class="material-symbols-outlined" style="box-sizing: border-box; font-variation-settings: &quot;FILL&quot; 0, &quot;wght&quot; 400, &quot;GRAD&quot; 0, &quot;opsz&quot; 24; font-size: 14px; line-height: 1; user-select: none; display: inline-flex; align-items: center; gap: 4px; font-family: Material Symbols Outlined; font-weight: normal; font-style: normal; letter-spacing: normal; text-transform: none; white-space: nowrap; word-wrap: normal; direction: ltr; color: var(--coral-ink)">
								favorite
							</span>
							<!-- htmlswap-source: <span&gt;{{ map.likesLabel }}</span&gt; -->
							<span style="box-sizing: border-box; display: inline-flex; align-items: center; gap: 4px">
								{map.likesLabel}
							</span>
						</span>
						<!-- htmlswap-source: <span title="People who adopted this"&gt; -->
						<span title="People who adopted this" style="box-sizing: border-box; display: inline-flex; align-items: center; gap: 4px">
							<!-- htmlswap-source: <span class="material-symbols-outlined" style="font-size: 14px;"&gt;download</span&gt; -->
							<span class="material-symbols-outlined" style="box-sizing: border-box; font-variation-settings: &quot;FILL&quot; 0, &quot;wght&quot; 400, &quot;GRAD&quot; 0, &quot;opsz&quot; 24; font-size: 14px; line-height: 1; user-select: none; display: inline-flex; align-items: center; gap: 4px; font-family: Material Symbols Outlined; font-weight: normal; font-style: normal; letter-spacing: normal; text-transform: none; white-space: nowrap; word-wrap: normal; direction: ltr">
								download
							</span>
							<!-- htmlswap-source: <span&gt;{{ map.adoptionsLabel }}</span&gt; -->
							<span style="box-sizing: border-box; display: inline-flex; align-items: center; gap: 4px">
								{map.adoptionsLabel}
							</span>
						</span>
						{#if map.compiles}
							<!-- htmlswap-source: <span class="ok" title="Verified to compile"&gt; -->
							<span class="ok" title="Verified to compile" style="box-sizing: border-box; display: inline-flex; align-items: center; gap: 4px; color: var(--added)">
								<!-- htmlswap-source: <span class="material-symbols-outlined" style="font-size: 14px;"&gt;verified</span&gt; -->
								<span class="material-symbols-outlined" style="box-sizing: border-box; font-variation-settings: &quot;FILL&quot; 0, &quot;wght&quot; 400, &quot;GRAD&quot; 0, &quot;opsz&quot; 24; font-size: 14px; line-height: 1; user-select: none; display: inline-flex; align-items: center; gap: 4px; font-family: Material Symbols Outlined; font-weight: normal; font-style: normal; letter-spacing: normal; text-transform: none; white-space: nowrap; word-wrap: normal; direction: ltr">
									verified
								</span>
								<!-- htmlswap-source: <span&gt;compiles</span&gt; -->
								<span style="box-sizing: border-box; display: inline-flex; align-items: center; gap: 4px">
									compiles
								</span>
							</span>
						{/if}
					</div>
					<!-- htmlswap-source: <div class="row" style="gap: 6px; margin-top: auto;"&gt; -->
					<div class="row" style="box-sizing: border-box; display: flex; align-items: center; gap: 6px; margin-top: auto">
						<!-- htmlswap-source: <button id="{{ map.previewActionId }}" class="btn" data-htmlswap-size="sm" data-htmlswap-tone="neutral" data-htmlswap-variant="ghost" style="flex: 1;" onClick="{{ map.preview }}"&gt; -->
						<button class="btn hs_1" id={map.previewActionId} data-htmlswap-size="sm" data-htmlswap-tone="neutral" data-htmlswap-variant="ghost" style="box-sizing: border-box; font: inherit; cursor: pointer; border: 1px solid #0000; background: none; color: var(--ink-2); display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 29px; padding: 0 11px; border-radius: var(--r-2); font-weight: 500; font-size: 12px; white-space: nowrap; transition: background .1s, border-color .1s, color .1s; flex: 1" onclick={map.preview}>
							<!-- htmlswap-source: <span class="material-symbols-outlined"&gt;visibility</span&gt; -->
							<span class="material-symbols-outlined" style="box-sizing: border-box; font-variation-settings: &quot;FILL&quot; 0, &quot;wght&quot; 400, &quot;GRAD&quot; 0, &quot;opsz&quot; 24; font-size: 16px; line-height: 1; user-select: none; font-family: Material Symbols Outlined; font-weight: normal; font-style: normal; letter-spacing: normal; text-transform: none; display: inline-block; white-space: nowrap; word-wrap: normal; direction: ltr">
								visibility
							</span>
							<!-- htmlswap-source: <span&gt;Preview</span&gt; -->
							<span style="box-sizing: border-box">
								Preview
							</span>
						</button>
						<!-- htmlswap-source: <button id="{{ map.adoptActionId }}" class="btn" data-htmlswap-size="sm" data-htmlswap-tone="accent" data-htmlswap-variant="solid" style="flex: 1;" onClick="{{ map.adopt }}"&gt; -->
						<button class="btn hs_2" id={map.adoptActionId} data-htmlswap-size="sm" data-htmlswap-tone="accent" data-htmlswap-variant="solid" style="box-sizing: border-box; font: inherit; cursor: pointer; border: 1px solid #0000; background: var(--coral); color: #241009; display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 29px; padding: 0 11px; border-radius: var(--r-2); font-weight: 500; font-size: 12px; white-space: nowrap; transition: background .1s, border-color .1s, color .1s; flex: 1" onclick={map.adopt}>
							<!-- htmlswap-source: <span class="material-symbols-outlined"&gt;download</span&gt; -->
							<span class="material-symbols-outlined" style="box-sizing: border-box; font-variation-settings: &quot;FILL&quot; 0, &quot;wght&quot; 400, &quot;GRAD&quot; 0, &quot;opsz&quot; 24; font-size: 16px; line-height: 1; user-select: none; font-family: Material Symbols Outlined; font-weight: normal; font-style: normal; letter-spacing: normal; text-transform: none; display: inline-block; white-space: nowrap; word-wrap: normal; direction: ltr">
								download
							</span>
							<!-- htmlswap-source: <span&gt;Adopt</span&gt; -->
							<span style="box-sizing: border-box">
								Adopt
							</span>
						</button>
					</div>
				</div>
			</article>
		{/each}
		{#if browse.isEmpty}
			<!-- htmlswap-source: <div class="empty" style="width: 100%;"&gt; -->
			<div class="empty" style="box-sizing: border-box; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; padding: 40px; text-align: center; width: 100%">
				<!-- htmlswap-source: <span class="material-symbols-outlined" style="font-size: 28px; color: var(- -ink-3);"&gt;search_off</span&gt; -->
				<span class="material-symbols-outlined" style="box-sizing: border-box; font-variation-settings: &quot;FILL&quot; 0, &quot;wght&quot; 400, &quot;GRAD&quot; 0, &quot;opsz&quot; 24; font-size: 28px; line-height: 1; user-select: none; font-family: Material Symbols Outlined; font-weight: normal; font-style: normal; letter-spacing: normal; text-transform: none; display: inline-block; white-space: nowrap; word-wrap: normal; direction: ltr; color: var(--ink-3)">
					search_off
				</span>
				<!-- htmlswap-source: <p class="muted" style="margin: 0;"&gt;No maps match that filter.</p&gt; -->
				<p class="muted" style="box-sizing: border-box; color: var(--ink-3); margin: 0">
					No maps match that filter.
				</p>
			</div>
		{/if}
	</div>
	{#if browse.preview.visible}
		<!-- htmlswap-source: <div class="overlay" onClick="{{ browse.preview.close }}"&gt; -->
		<div class="overlay" role="button" tabindex="0" style="box-sizing: border-box; position: fixed; inset: 0; display: flex; align-items: center; justify-content: center; background: #18141080; backdrop-filter: blur(6px); z-index: 300" onclick={browse.preview.close} onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); const handler = browse.preview.close; handler?.(event); } }}>
			<!-- htmlswap-source: <div class="modal" style="width: 560px;" onClick="{{ browse.preview.stopClose }}"&gt; -->
			<div class="modal" role="button" tabindex="0" style="box-sizing: border-box; display: flex; flex-direction: column; gap: 14px; width: 560px; max-width: calc(100vw - 40px); background: var(--surface); border: 1px solid var(--line-2); border-radius: var(--r-4); box-shadow: 0 24px 70px -20px #00000080; padding: 20px" onclick={browse.preview.stopClose} onkeydown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); const handler = browse.preview.stopClose; handler?.(event); } }}>
				<!-- htmlswap-source: <div class="row" style="gap: 10px;"&gt; -->
				<div class="row" style="box-sizing: border-box; display: flex; align-items: center; gap: 10px">
					<!-- htmlswap-source: <div class="col" style="flex: 1; min-width: 0;"&gt; -->
					<div class="col" style="box-sizing: border-box; display: flex; flex-direction: column; flex: 1; min-width: 0">
						<!-- htmlswap-source: <div class="row" style="gap: 8px;"&gt; -->
						<div class="row" style="box-sizing: border-box; display: flex; align-items: center; gap: 8px">
							<!-- htmlswap-source: <b style="font-size: 16px;"&gt;{{ browse.preview.name }}</b&gt; -->
							<b style="box-sizing: border-box; font-size: 16px">
								{browse.preview.name}
							</b>
							{#if browse.preview.official}
								<!-- htmlswap-source: <span class="tag" style="background: var(- -ink); color: var(- -paper);"&gt;official</span&gt; -->
								<span class="tag" style="box-sizing: border-box; display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; font-family: var(--mono); font-size: 10px; text-transform: uppercase; letter-spacing: .07em; background: var(--ink); color: var(--paper)">
									official
								</span>
							{/if}
						</div>
						<!-- htmlswap-source: <div class="row" style="gap: 6px;"&gt; -->
						<div class="row" style="box-sizing: border-box; display: flex; align-items: center; gap: 6px">
							{#if browse.preview.hasAvatar}
								<!-- htmlswap-source: <img class="avatar" src="{{ browse.preview.avatarUrl }}" alt="{{ browse.preview.authorLabel }}" style="{{ browse.preview.avatarStyle }}"&gt; -->
								<img class="avatar" src={browse.preview.avatarUrl} alt={browse.preview.authorLabel} style={`box-sizing: border-box; border-radius: 999px; object-fit: cover; background: var(--surface-2); flex-shrink: 0; display: block; ${__htmlswap_style(browse.preview.avatarStyle)}`} />
							{:else}
								<!-- htmlswap-source: <span class="avatar fallback" style="{{ browse.preview.avatarStyle }}"&gt;{{ browse.preview.initials }}</span&gt; -->
								<span class="avatar fallback" style={`box-sizing: border-box; border-radius: 999px; object-fit: cover; background: var(--ink); flex-shrink: 0; display: flex; align-items: center; justify-content: center; font-family: var(--mono); font-weight: 700; color: var(--paper); ${__htmlswap_style(browse.preview.avatarStyle)}`}>
									{browse.preview.initials}
								</span>
							{/if}
							<!-- htmlswap-source: <span class="map-by"&gt;{{ browse.preview.byline }}</span&gt; -->
							<span class="map-by" style="box-sizing: border-box; font-family: var(--mono); font-size: 10px; color: var(--ink-3)">
								{browse.preview.byline}
							</span>
						</div>
					</div>
					<!-- htmlswap-source: <button id="browse-close-preview" class="place-x" onClick="{{ browse.preview.close }}"&gt; -->
					<button class="place-x hs_3" id="browse-close-preview" style="box-sizing: border-box; font: inherit; cursor: pointer; border: 0; background: none; color: var(--ink-2); display: flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 7px" onclick={browse.preview.close}>
						<!-- htmlswap-source: <span class="material-symbols-outlined"&gt;close</span&gt; -->
						<span class="material-symbols-outlined" style="box-sizing: border-box; font-variation-settings: &quot;FILL&quot; 0, &quot;wght&quot; 400, &quot;GRAD&quot; 0, &quot;opsz&quot; 24; font-size: 24px; line-height: 1; user-select: none; font-family: Material Symbols Outlined; font-weight: normal; font-style: normal; letter-spacing: normal; text-transform: none; display: inline-block; white-space: nowrap; word-wrap: normal; direction: ltr">
							close
						</span>
					</button>
				</div>
				<!-- htmlswap-source: <div class="map-preview big"&gt; -->
				<div class="map-preview big" style="box-sizing: border-box; display: flex; align-items: center; justify-content: center; padding: 16px; background: var(--surface-2); border-bottom: 1px solid var(--line); min-height: 150px; cursor: pointer; border: 1px solid var(--line); border-radius: var(--r-2)">
					<!-- htmlswap-source: <div class="mini-board" style="{{ browse.preview.boardStyle }}"&gt; -->
					<div class="mini-board" style={`box-sizing: border-box; transform-origin: center; ${__htmlswap_style(browse.preview.boardStyle)}`}>
						{#each browse.preview.rows as previewRow, $index}
							<!-- htmlswap-source: <div style="{{ previewRow.style }}" data-htmlswap-key="{{ previewRow.id }}"&gt; -->
							<div data-htmlswap-key={previewRow.id} style={`box-sizing: border-box; ${__htmlswap_style(previewRow.style)}`}>
								{#each previewRow.groups as group, $index}
									{#if group.isGap}
										<!-- htmlswap-source: <div style="{{ group.style }}" data-htmlswap-key="{{ group.id }}"&gt;</div&gt; -->
										<div data-htmlswap-key={group.id} style={`box-sizing: border-box; ${__htmlswap_style(group.style)}`}>
										</div>
									{:else}
										<!-- htmlswap-source: <div style="{{ group.style }}" data-htmlswap-key="{{ group.id }}"&gt; -->
										<div data-htmlswap-key={group.id} style={`box-sizing: border-box; ${__htmlswap_style(group.style)}`}>
											{#each group.cells as cell, $index}
												<!-- htmlswap-source: <span style="{{ cell.style }}" data-htmlswap-key="{{ cell.id }}"&gt;</span&gt; -->
												<span data-htmlswap-key={cell.id} style={`box-sizing: border-box; ${__htmlswap_style(cell.style)}`}>
												</span>
											{/each}
										</div>
									{/if}
								{/each}
							</div>
						{/each}
					</div>
				</div>
				<!-- htmlswap-source: <p style="margin: 0; font-size: 13px; line-height: 1.6; color: var(- -ink-2);"&gt;{{ browse.preview.note }}</p&gt; -->
				<p style="box-sizing: border-box; margin: 0; font-size: 13px; line-height: 1.6; color: var(--ink-2)">
					{browse.preview.note}
				</p>
				<!-- htmlswap-source: <div class="row" style="gap: 5px; flex-wrap: wrap;"&gt; -->
				<div class="row" style="box-sizing: border-box; display: flex; align-items: center; gap: 5px; flex-wrap: wrap">
					{#each browse.preview.tags as previewTag, $index}
						<!-- htmlswap-source: <span class="tag" data-htmlswap-key="{{ previewTag.id }}"&gt;{{ previewTag.label }}</span&gt; -->
						<span class="tag" data-htmlswap-key={previewTag.id} style="box-sizing: border-box; display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; font-family: var(--mono); font-size: 10px; text-transform: uppercase; letter-spacing: .07em; background: var(--surface-2); color: var(--ink-2)">
							{previewTag.label}
						</span>
					{/each}
				</div>
				<!-- htmlswap-source: <div class="signals"&gt; -->
				<div class="signals" style="box-sizing: border-box; display: flex; align-items: center; gap: 14px; font-family: var(--mono); font-size: 11px; color: var(--ink-2)">
					<!-- htmlswap-source: <span title="Likes"&gt; -->
					<span title="Likes" style="box-sizing: border-box; display: inline-flex; align-items: center; gap: 4px">
						<!-- htmlswap-source: <span class="material-symbols-outlined" style="font-size: 14px; color: var(- -coral-ink);"&gt;favorite</span&gt; -->
						<span class="material-symbols-outlined" style="box-sizing: border-box; font-variation-settings: &quot;FILL&quot; 0, &quot;wght&quot; 400, &quot;GRAD&quot; 0, &quot;opsz&quot; 24; font-size: 14px; line-height: 1; user-select: none; display: inline-flex; align-items: center; gap: 4px; font-family: Material Symbols Outlined; font-weight: normal; font-style: normal; letter-spacing: normal; text-transform: none; white-space: nowrap; word-wrap: normal; direction: ltr; color: var(--coral-ink)">
							favorite
						</span>
						<!-- htmlswap-source: <span&gt;{{ browse.preview.likesLabel }}</span&gt; -->
						<span style="box-sizing: border-box; display: inline-flex; align-items: center; gap: 4px">
							{browse.preview.likesLabel}
						</span>
					</span>
					<!-- htmlswap-source: <span title="People who adopted this"&gt; -->
					<span title="People who adopted this" style="box-sizing: border-box; display: inline-flex; align-items: center; gap: 4px">
						<!-- htmlswap-source: <span class="material-symbols-outlined" style="font-size: 14px;"&gt;download</span&gt; -->
						<span class="material-symbols-outlined" style="box-sizing: border-box; font-variation-settings: &quot;FILL&quot; 0, &quot;wght&quot; 400, &quot;GRAD&quot; 0, &quot;opsz&quot; 24; font-size: 14px; line-height: 1; user-select: none; display: inline-flex; align-items: center; gap: 4px; font-family: Material Symbols Outlined; font-weight: normal; font-style: normal; letter-spacing: normal; text-transform: none; white-space: nowrap; word-wrap: normal; direction: ltr">
							download
						</span>
						<!-- htmlswap-source: <span&gt;{{ browse.preview.adoptionsLabel }}</span&gt; -->
						<span style="box-sizing: border-box; display: inline-flex; align-items: center; gap: 4px">
							{browse.preview.adoptionsLabel}
						</span>
					</span>
					{#if browse.preview.compiles}
						<!-- htmlswap-source: <span class="ok" title="Verified to compile"&gt; -->
						<span class="ok" title="Verified to compile" style="box-sizing: border-box; display: inline-flex; align-items: center; gap: 4px; color: var(--added)">
							<!-- htmlswap-source: <span class="material-symbols-outlined" style="font-size: 14px;"&gt;verified</span&gt; -->
							<span class="material-symbols-outlined" style="box-sizing: border-box; font-variation-settings: &quot;FILL&quot; 0, &quot;wght&quot; 400, &quot;GRAD&quot; 0, &quot;opsz&quot; 24; font-size: 14px; line-height: 1; user-select: none; display: inline-flex; align-items: center; gap: 4px; font-family: Material Symbols Outlined; font-weight: normal; font-style: normal; letter-spacing: normal; text-transform: none; white-space: nowrap; word-wrap: normal; direction: ltr">
								verified
							</span>
							<!-- htmlswap-source: <span&gt;compiles</span&gt; -->
							<span style="box-sizing: border-box; display: inline-flex; align-items: center; gap: 4px">
								compiles
							</span>
						</span>
					{/if}
				</div>
				<!-- htmlswap-source: <div class="row" style="gap: 8px;"&gt; -->
				<div class="row" style="box-sizing: border-box; display: flex; align-items: center; gap: 8px">
					<!-- htmlswap-source: <button id="browse-adopt-preview" class="btn" data-htmlswap-tone="accent" data-htmlswap-variant="solid" style="flex: 1;" onClick="{{ browse.preview.adopt }}"&gt; -->
					<button class="btn hs_4" id="browse-adopt-preview" data-htmlswap-tone="accent" data-htmlswap-variant="solid" style="box-sizing: border-box; font: inherit; cursor: pointer; border: 1px solid #0000; background: var(--coral); color: #241009; display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 34px; padding: 0 14px; border-radius: var(--r-2); font-weight: 500; font-size: 13px; white-space: nowrap; transition: background .1s, border-color .1s, color .1s; flex: 1" onclick={browse.preview.adopt}>
						<!-- htmlswap-source: <span class="material-symbols-outlined"&gt;download</span&gt; -->
						<span class="material-symbols-outlined" style="box-sizing: border-box; font-variation-settings: &quot;FILL&quot; 0, &quot;wght&quot; 400, &quot;GRAD&quot; 0, &quot;opsz&quot; 24; font-size: 18px; line-height: 1; user-select: none; font-family: Material Symbols Outlined; font-weight: normal; font-style: normal; letter-spacing: normal; text-transform: none; display: inline-block; white-space: nowrap; word-wrap: normal; direction: ltr">
							download
						</span>
						<!-- htmlswap-source: <span&gt;Adopt as a variant</span&gt; -->
						<span style="box-sizing: border-box">
							Adopt as a variant
						</span>
					</button>
					<!-- htmlswap-source: <button id="browse-report-preview" class="btn" data-htmlswap-tone="neutral" data-htmlswap-variant="ghost" title="Report this map" onClick="{{ browse.preview.report }}"&gt; -->
					<button class="btn hs_5" id="browse-report-preview" data-htmlswap-tone="neutral" data-htmlswap-variant="ghost" title="Report this map" style="box-sizing: border-box; font: inherit; cursor: pointer; border: 1px solid #0000; background: none; color: var(--ink-2); display: inline-flex; align-items: center; justify-content: center; gap: 7px; height: 34px; padding: 0 14px; border-radius: var(--r-2); font-weight: 500; font-size: 13px; white-space: nowrap; transition: background .1s, border-color .1s, color .1s" onclick={browse.preview.report}>
						<!-- htmlswap-source: <span class="material-symbols-outlined"&gt;flag</span&gt; -->
						<span class="material-symbols-outlined" style="box-sizing: border-box; font-variation-settings: &quot;FILL&quot; 0, &quot;wght&quot; 400, &quot;GRAD&quot; 0, &quot;opsz&quot; 24; font-size: 18px; line-height: 1; user-select: none; font-family: Material Symbols Outlined; font-weight: normal; font-style: normal; letter-spacing: normal; text-transform: none; display: inline-block; white-space: nowrap; word-wrap: normal; direction: ltr">
							flag
						</span>
						<!-- htmlswap-source: <span&gt;Report</span&gt; -->
						<span style="box-sizing: border-box">
							Report
						</span>
					</button>
				</div>
			</div>
		</div>
	{/if}
</section>
