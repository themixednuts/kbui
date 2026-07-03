<!-- htmlswap: requires svelte@^5.56.4 -->
<script lang="ts">
	let { editor = [], group = [], inspector = [], keyboard = [], lighting = [], row = [] }: { editor?: any; group?: any; inspector?: any; keyboard?: any; lighting?: any; row?: any } = $props();
	let editor_key_notes = $state("");
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
	.hs_0.seg [role="tab"]:hover:hover {
		color: var(--ink);
	}
	.hs_1.layer-chip:hover:hover {
		border-color: var(--ink-3);
	}
	.hs_2.btn[data-htmlswap-tone="neutral"][data-htmlswap-variant="ghost"]:hover:hover {
		background: var(--surface-2);
		color: var(--ink);
	}
	.hs_3.keycap:hover:hover {
		transform: translateY(-1px);
		border-color: #1b19175c;
	}
	.hs_3.keycap:active:active {
		transform: translateY(1px);
		box-shadow: 0 1px #00000029, 0 1px 3px #1b19171f;
	}
	.hs_4.btn[data-htmlswap-tone="neutral"][data-htmlswap-variant="ghost"]:hover:hover {
		background: var(--surface-2);
		color: var(--ink);
	}
	.hs_5.btn[data-htmlswap-tone="accent"][data-htmlswap-variant="solid"]:hover:hover {
		background: oklch(68% .18 32);
	}
	.hs_6.seg [role="tab"]:hover:hover {
		color: var(--ink);
	}
	.hs_7.kc-pill:hover:hover {
		border-color: var(--line-2);
	}
	.hs_8.btn[data-htmlswap-tone="neutral"][data-htmlswap-variant="ghost"]:hover:hover {
		background: var(--surface-2);
		color: var(--ink);
	}
	.hs_9.input:focus:focus {
		border-color: var(--ink);
	}
	.hs_10.input:focus:focus {
		border-color: var(--ink);
	}
	.hs_11 input[type="range"]::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 16px;
		height: 16px;
		border-radius: 999px;
		background: var(--ink);
		border: 2px solid var(--surface);
		box-shadow: 0 0 0 1px var(--ink);
	}
	.hs_12.input:focus:focus {
		border-color: var(--ink);
	}
	.hs_13.btn[data-htmlswap-tone="neutral"][data-htmlswap-variant="ghost"]:hover:hover {
		background: var(--surface-2);
		color: var(--ink);
	}
	.hs_14.btn[data-htmlswap-tone="neutral"][data-htmlswap-variant="ghost"]:hover:hover {
		background: var(--surface-2);
		color: var(--ink);
	}
	.hs_15.btn[data-htmlswap-tone="neutral"][data-htmlswap-variant="ghost"]:hover:hover {
		background: var(--surface-2);
		color: var(--ink);
	}
	.hs_16 input[type="range"]::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 16px;
		height: 16px;
		border-radius: 999px;
		background: var(--ink);
		border: 2px solid var(--surface);
		box-shadow: 0 0 0 1px var(--ink);
	}
	.hs_17.seg [role="tab"]:hover:hover {
		color: var(--ink);
	}
	.hs_18 input[type="range"]::-webkit-slider-thumb {
		-webkit-appearance: none;
		width: 16px;
		height: 16px;
		border-radius: 999px;
		background: var(--ink);
		border: 2px solid var(--surface);
		box-shadow: 0 0 0 1px var(--ink);
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
<!-- htmlswap-source: <section class="body" data-htmlswap-region="editor.keymap"&gt; -->
<section class="body" data-htmlswap-region="editor.keymap" style="box-sizing: border-box; display: flex; flex: 1; min-height: 0; overflow: auto">
	<!-- htmlswap-source: <div class="main"&gt; -->
	<div class="main" style="box-sizing: border-box; display: flex; flex-direction: column; flex: 1; min-width: 0; overflow: auto; padding: 22px 24px; gap: 18px">
		<!-- htmlswap-source: <div class="row" style="gap: 12px; flex-wrap: wrap;"&gt; -->
		<div class="row" style="box-sizing: border-box; display: flex; align-items: center; gap: 12px; flex-wrap: wrap">
			<!-- htmlswap-source: <div class="seg" role="tablist" data-htmlswap-component="tabs"&gt; -->
			<div class="seg" role="tablist" role="tablist" style="box-sizing: border-box; display: inline-flex; gap: 2px; padding: 3px; border-radius: 999px; background: var(--surface-2)">
				{#each editor.lensTabs as lensTab, $index}
					<!-- htmlswap-source: <button id="{{ lensTab.buttonId }}" role="tab" aria-selected="{{ lensTab.selected }}" onClick="{{ lensTab.select }}"&gt; -->
					<button class="hs_0" role="tab" id={lensTab.buttonId} role="tab" aria-selected={lensTab.selected} style="box-sizing: border-box; font: inherit; cursor: pointer; border: 0; background: none; color: var(--ink-2); height: 28px; padding: 0 14px; border-radius: 999px; font-family: var(--mono); font-size: 12px; letter-spacing: .03em; transition: background .1s, color .1s" onclick={lensTab.select}>
						
              {lensTab.label}
            
					</button>
				{/each}
			</div>
			<!-- htmlswap-source: <div class="layer-row"&gt; -->
			<div class="layer-row" style="box-sizing: border-box; display: flex; gap: 8px; flex-wrap: wrap; align-items: center">
				{#each editor.layers as layer, $index}
					<!-- htmlswap-source: <button -->
					<button class="layer-chip hs_1" id={layer.buttonId} aria-pressed={layer.active} data-htmlswap-key={layer.id} style={`box-sizing: border-box; font: inherit; cursor: pointer; border: 1px solid var(--line-2); background: var(--surface); color: inherit; display: inline-flex; align-items: center; gap: 8px; height: 34px; padding: 0 13px 0 10px; border-radius: 999px; font-weight: 500; font-size: 13px; transition: background .1s, border-color .1s; ${__htmlswap_style(layer.style)}`} onclick={layer.select}>
						<!-- htmlswap-source: <span class="swatch" style="{{ layer.swatchStyle }}"&gt;</span&gt; -->
						<span class="swatch" style={`box-sizing: border-box; width: 13px; height: 13px; border-radius: 4px; background: var(--c, var(--coral)); box-shadow: inset 0 -2px #0000002e; ${__htmlswap_style(layer.swatchStyle)}`}>
						</span>
						<!-- htmlswap-source: <span&gt;{{ layer.name }}</span&gt; -->
						<span style="box-sizing: border-box">
							{layer.name}
						</span>
					</button>
				{/each}
			</div>
			<!-- htmlswap-source: <div class="spacer"&gt;</div&gt; -->
			<div class="spacer" style="box-sizing: border-box; flex: 1">
			</div>
			{#if editor.isKeysLens}
				<!-- htmlswap-source: <button -->
				<button class="btn hs_2" id="editor-toggle-fallthrough" data-htmlswap-variant="ghost" data-htmlswap-tone="neutral" data-htmlswap-size="sm" aria-pressed={editor.showFallthrough} style="box-sizing: border-box; font: inherit; cursor: pointer; border: 1px solid #0000; background: none; color: var(--ink-2); display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 29px; padding: 0 11px; border-radius: var(--r-2); font-weight: 500; font-size: 12px; white-space: nowrap; transition: background .1s, border-color .1s, color .1s" onclick={editor.toggleFallthrough}>
					<!-- htmlswap-source: <span class="material-symbols-outlined"&gt;{{ editor.fallthroughIcon }}</span&gt; -->
					<span class="material-symbols-outlined" style="box-sizing: border-box; font-variation-settings: &quot;FILL&quot; 0, &quot;wght&quot; 400, &quot;GRAD&quot; 0, &quot;opsz&quot; 24; font-size: 16px; line-height: 1; user-select: none; font-family: Material Symbols Outlined; font-weight: normal; font-style: normal; letter-spacing: normal; text-transform: none; display: inline-block; white-space: nowrap; word-wrap: normal; direction: ltr">
						{editor.fallthroughIcon}
					</span>
					<!-- htmlswap-source: <span&gt;Fall-through</span&gt; -->
					<span style="box-sizing: border-box">
						Fall-through
					</span>
				</button>
			{:else}
				<!-- htmlswap-source: <span class="chip"&gt; -->
				<span class="chip" style="box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 999px; border: 1px solid var(--line-2); background: var(--surface); font-family: var(--mono); font-size: 11px; letter-spacing: .03em; color: var(--ink-2)">
					<!-- htmlswap-source: <span class="dot" style="{{ editor.selectionDotStyle }}"&gt;</span&gt; -->
					<span class="dot" style={`box-sizing: border-box; width: 8px; height: 8px; border-radius: 999px; background: currentColor; ${__htmlswap_style(editor.selectionDotStyle)}`}>
					</span>
					<!-- htmlswap-source: <span class="material-symbols-outlined"&gt;lightbulb</span&gt; -->
					<span class="material-symbols-outlined" style="box-sizing: border-box; font-variation-settings: &quot;FILL&quot; 0, &quot;wght&quot; 400, &quot;GRAD&quot; 0, &quot;opsz&quot; 24; font-size: 14px; line-height: 1; user-select: none; font-family: Material Symbols Outlined; font-weight: normal; font-style: normal; letter-spacing: normal; text-transform: none; display: inline-block; white-space: nowrap; word-wrap: normal; direction: ltr">
						lightbulb
					</span>
					<!-- htmlswap-source: <span&gt;{{ editor.selectionCountLabel }}</span&gt; -->
					<span style="box-sizing: border-box">
						{editor.selectionCountLabel}
					</span>
				</span>
			{/if}
		</div>
		<!-- htmlswap-source: <div -->
		<div class="stage" style={`box-sizing: border-box; display: flex; align-items: center; justify-content: center; flex: 1; padding: 24px 0; ${__htmlswap_style(editor.stageStyle)}`} onmousedown={editor.startLightingSelection} onmousemove={editor.extendLightingSelection}>
			<!-- htmlswap-source: <div class="kb" style="{{ keyboard.style }}" data-htmlswap-component="keyboard"&gt; -->
			<div class="kb" style={`box-sizing: border-box; display: flex; flex-direction: column; gap: 5px; ${__htmlswap_style(keyboard.style)}`}>
				{#each keyboard.rows as row, $index}
					<!-- htmlswap-source: <div class="kb-row" data-htmlswap-key="{{ row.id }}"&gt; -->
					<div class="kb-row" data-htmlswap-key={row.id} style="box-sizing: border-box; display: flex; gap: 5px; align-items: stretch">
						{#each row.keys as key, $index}
							{#if key.visible}
								<!-- htmlswap-source: <button -->
								<button class="{{ key.className }}" id={key.buttonId} aria-pressed={key.selected} title={key.title} data-htmlswap-key={key.id} style={`box-sizing: border-box; font: inherit; cursor: pointer; border: 0; background: none; color: inherit; ${__htmlswap_style(key.style)}`} onclick={key.select} onmousedown={key.startSelection} onmouseenter={key.extendSelection}>
									<!-- htmlswap-source: <div class="cap-top"&gt; -->
									<div class="cap-top" style="box-sizing: border-box">
										<!-- htmlswap-source: <span class="cap-legend"&gt;{{ key.legend }}</span&gt; -->
										<span class="cap-legend" style="box-sizing: border-box">
											{key.legend}
										</span>
										{#if key.hasSource}
											<!-- htmlswap-source: <span class="cap-src" style="{{ key.sourceStyle }}"&gt;{{ key.source }}</span&gt; -->
											<span class="cap-src" style={`box-sizing: border-box; ${__htmlswap_style(key.sourceStyle)}`}>
												{key.source}
											</span>
										{/if}
									</div>
									<!-- htmlswap-source: <div class="cap-glyph"&gt; -->
									<div class="cap-glyph" style="box-sizing: border-box">
										<!-- htmlswap-source: <span class="g-main" style="{{ key.mainStyle }}"&gt;{{ key.main }}</span&gt; -->
										<span class="g-main" style={`box-sizing: border-box; ${__htmlswap_style(key.mainStyle)}`}>
											{key.main}
										</span>
										{#if key.hasSub}
											<!-- htmlswap-source: <span class="g-sub"&gt;{{ key.sub }}</span&gt; -->
											<span class="g-sub" style="box-sizing: border-box">
												{key.sub}
											</span>
										{/if}
									</div>
									<!-- htmlswap-source: <div class="cap-home"&gt; -->
									<div class="cap-home" style="box-sizing: border-box">
										{#if key.homing}
											<!-- htmlswap-source: <i&gt;</i&gt; -->
											<i style="box-sizing: border-box">
											</i>
										{/if}
									</div>
								</button>
							{:else}
								<!-- htmlswap-source: <div class="keycap ghost" style="{{ key.style }}" data-htmlswap-key="{{ key.id }}"&gt;</div&gt; -->
								<div class="keycap ghost hs_3" data-htmlswap-key={key.id} style={`box-sizing: border-box; display: flex; flex-direction: column; padding: 5px 7px 6px; border-radius: 8px; background: linear-gradient(#fffdf7 0%, #ebe2ce 100%); border: 1px solid #1b19172e; box-shadow: var(--shadow-cap); color: var(--ink); text-align: left; transition: transform 70ms, box-shadow 70ms, border-color 70ms; user-select: none; min-height: 50px; visibility: hidden; ${__htmlswap_style(key.style)}`}>
								</div>
							{/if}
						{/each}
					</div>
				{/each}
			</div>
			{#if keyboard.isSplit}
				<!-- htmlswap-source: <div class="kb-split-label"&gt; -->
				<div class="kb-split-label" style="box-sizing: border-box; display: flex; align-items: center; justify-content: center; gap: 6px; font-family: var(--mono); font-size: 10px; letter-spacing: .12em; color: var(--ink-3); text-transform: uppercase">
					<!-- htmlswap-source: <span class="material-symbols-outlined" style="font-size: 14px;"&gt;cable</span&gt; -->
					<span class="material-symbols-outlined" style="box-sizing: border-box; font-variation-settings: &quot;FILL&quot; 0, &quot;wght&quot; 400, &quot;GRAD&quot; 0, &quot;opsz&quot; 24; font-size: 14px; line-height: 1; user-select: none; font-family: Material Symbols Outlined; font-weight: normal; font-style: normal; letter-spacing: normal; text-transform: none; display: inline-block; white-space: nowrap; word-wrap: normal; direction: ltr">
						cable
					</span>
					<!-- htmlswap-source: <span&gt;TRRS · left ↔ right</span&gt; -->
					<span style="box-sizing: border-box">
						TRRS · left ↔ right
					</span>
				</div>
			{/if}
			{#if editor.combo.visible}
				<!-- htmlswap-source: <div class="pick-bar"&gt; -->
				<div class="pick-bar" style="box-sizing: border-box; display: flex; align-items: center; gap: 10px; padding: 10px 14px; background: color-mix(in oklch, var(--teal) 16%, var(--surface)); border: 1px solid color-mix(in oklch, var(--teal) 45%, transparent); border-radius: var(--r-2); font-size: 13px">
					<!-- htmlswap-source: <span class="material-symbols-outlined"&gt;ads_click</span&gt; -->
					<span class="material-symbols-outlined" style="box-sizing: border-box; font-variation-settings: &quot;FILL&quot; 0, &quot;wght&quot; 400, &quot;GRAD&quot; 0, &quot;opsz&quot; 24; font-size: 18px; line-height: 1; user-select: none; color: var(--teal-ink); font-family: Material Symbols Outlined; font-weight: normal; font-style: normal; letter-spacing: normal; text-transform: none; display: inline-block; white-space: nowrap; word-wrap: normal; direction: ltr">
						ads_click
					</span>
					<!-- htmlswap-source: <span&gt;Picking members for <b&gt;{{ editor.combo.label }}</b&gt; · {{ editor.combo.countLabel }}</span&gt; -->
					<span style="box-sizing: border-box">
						Picking members for 
						<!-- htmlswap-source: <b&gt;{{ editor.combo.label }}</b&gt; -->
						<b style="box-sizing: border-box">
							{editor.combo.label}
						</b>
						 · {editor.combo.countLabel}
					</span>
					<!-- htmlswap-source: <div class="spacer"&gt;</div&gt; -->
					<div class="spacer" style="box-sizing: border-box; flex: 1">
					</div>
					<!-- htmlswap-source: <button id="editor-cancel-combo" class="btn" data-htmlswap-size="sm" data-htmlswap-tone="neutral" data-htmlswap-variant="ghost" onClick="{{ editor.combo.cancel }}"&gt; -->
					<button class="btn hs_4" id="editor-cancel-combo" data-htmlswap-size="sm" data-htmlswap-tone="neutral" data-htmlswap-variant="ghost" style="box-sizing: border-box; font: inherit; cursor: pointer; border: 1px solid #0000; background: none; color: var(--ink-2); display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 29px; padding: 0 11px; border-radius: var(--r-2); font-weight: 500; font-size: 12px; white-space: nowrap; transition: background .1s, border-color .1s, color .1s" onclick={editor.combo.cancel}>
						<!-- htmlswap-source: <span&gt;Cancel</span&gt; -->
						<span style="box-sizing: border-box">
							Cancel
						</span>
					</button>
					<!-- htmlswap-source: <button id="editor-confirm-combo" class="btn" data-htmlswap-size="sm" data-htmlswap-tone="accent" data-htmlswap-variant="solid" disabled="{{ editor.combo.confirmDisabled }}" onClick="{{ editor.combo.confirm }}"&gt; -->
					<button class="btn hs_5" id="editor-confirm-combo" data-htmlswap-size="sm" data-htmlswap-tone="accent" data-htmlswap-variant="solid" disabled={editor.combo.confirmDisabled} style="box-sizing: border-box; font: inherit; cursor: pointer; border: 1px solid #0000; background: var(--coral); color: #241009; display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 29px; padding: 0 11px; border-radius: var(--r-2); font-weight: 500; font-size: 12px; white-space: nowrap; transition: background .1s, border-color .1s, color .1s; opacity: .45; pointer-events: none" onclick={editor.combo.confirm}>
						<!-- htmlswap-source: <span&gt;Confirm combo</span&gt; -->
						<span style="box-sizing: border-box">
							Confirm combo
						</span>
					</button>
				</div>
			{/if}
		</div>
		{#if editor.isKeysLens}
			<!-- htmlswap-source: <div class="card"&gt; -->
			<div class="card" style="box-sizing: border-box; display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-3); box-shadow: var(--shadow-card)">
				<!-- htmlswap-source: <div class="card-header"&gt; -->
				<div class="card-header" style="box-sizing: border-box; display: flex; align-items: center; gap: 10px; padding: 13px 16px; border-bottom: 1px solid var(--line)">
					<!-- htmlswap-source: <h3&gt;Active layer stack</h3&gt; -->
					<h3 style="box-sizing: border-box; margin: 0; font-size: 12px; font-weight: 600; font-family: var(--mono); letter-spacing: .06em; text-transform: uppercase; color: var(--ink-2)">
						Active layer stack
					</h3>
					<!-- htmlswap-source: <span class="muted mono" style="font-size: 11px; margin-left: auto;"&gt;{{ editor.stackLabel }}</span&gt; -->
					<span class="muted mono" style="box-sizing: border-box; font-family: var(--mono); letter-spacing: .02em; color: var(--ink-3); font-size: 11px; margin-left: auto">
						{editor.stackLabel}
					</span>
				</div>
				<!-- htmlswap-source: <div class="card-body" style="flex-direction: row; align-items: center; flex-wrap: wrap; gap: 10px;"&gt; -->
				<div class="card-body" style="box-sizing: border-box; display: flex; flex-direction: row; padding: 16px; gap: 10px; align-items: center; flex-wrap: wrap">
					{#each editor.stackLayers as stackLayer, $index}
						<!-- htmlswap-source: <span class="chip" data-htmlswap-key="{{ stackLayer.id }}"&gt; -->
						<span class="chip" data-htmlswap-key={stackLayer.id} style="box-sizing: border-box; display: inline-flex; align-items: center; gap: 6px; height: 26px; padding: 0 10px; border-radius: 999px; border: 1px solid var(--line-2); background: var(--surface); font-family: var(--mono); font-size: 11px; letter-spacing: .03em; color: var(--ink-2)">
							<!-- htmlswap-source: <span class="dot" style="{{ stackLayer.dotStyle }}"&gt;</span&gt; -->
							<span class="dot" style={`box-sizing: border-box; width: 8px; height: 8px; border-radius: 999px; background: currentColor; ${__htmlswap_style(stackLayer.dotStyle)}`}>
							</span>
							<!-- htmlswap-source: <span&gt;{{ stackLayer.name }}</span&gt; -->
							<span style="box-sizing: border-box">
								{stackLayer.name}
							</span>
						</span>
					{/each}
					<!-- htmlswap-source: <div class="spacer"&gt;</div&gt; -->
					<div class="spacer" style="box-sizing: border-box; flex: 1">
					</div>
					<!-- htmlswap-source: <span class="muted mono" style="font-size: 11px;"&gt;hatched keys inherit from below</span&gt; -->
					<span class="muted mono" style="box-sizing: border-box; font-family: var(--mono); letter-spacing: .02em; color: var(--ink-3); font-size: 11px">
						hatched keys inherit from below
					</span>
				</div>
			</div>
		{:else}
			<!-- htmlswap-source: <div class="lens-hint"&gt; -->
			<div class="lens-hint" style="box-sizing: border-box; display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: var(--surface-2); border-radius: var(--r-2); font-size: 12px; color: var(--ink-2)">
				<!-- htmlswap-source: <span class="material-symbols-outlined"&gt;drag_pan</span&gt; -->
				<span class="material-symbols-outlined" style="box-sizing: border-box; font-variation-settings: &quot;FILL&quot; 0, &quot;wght&quot; 400, &quot;GRAD&quot; 0, &quot;opsz&quot; 24; font-size: 16px; line-height: 1; user-select: none; color: var(--ink-3); font-family: Material Symbols Outlined; font-weight: normal; font-style: normal; letter-spacing: normal; text-transform: none; display: inline-block; white-space: nowrap; word-wrap: normal; direction: ltr">
					drag_pan
				</span>
				<!-- htmlswap-source: <span&gt;Drag across keys to select. Shift-drag adds · Cmd/Ctrl-click toggles · click empty space to clear.</span&gt; -->
				<span style="box-sizing: border-box">
					Drag across keys to select. Shift-drag adds · Cmd/Ctrl-click toggles · click empty space to clear.
				</span>
			</div>
		{/if}
	</div>
	<!-- htmlswap-source: <aside class="inspector-side" data-htmlswap-region="editor.inspector"&gt; -->
	<aside class="inspector-side" data-htmlswap-region="editor.inspector" style="box-sizing: border-box; display: flex; flex-direction: column; gap: 12px; width: 340px; flex-shrink: 0; padding: 22px 22px 22px 0; overflow: auto">
		<!-- htmlswap-source: <div class="card"&gt; -->
		<div class="card" style="box-sizing: border-box; display: flex; flex-direction: column; background: var(--surface); border: 1px solid var(--line); border-radius: var(--r-3); box-shadow: var(--shadow-card)">
			<!-- htmlswap-source: <div class="card-body"&gt; -->
			<div class="card-body" style="box-sizing: border-box; display: flex; flex-direction: column; padding: 16px; gap: 12px">
				{#if editor.isKeysLens}
					<!-- htmlswap-source: <div class="key-hero"&gt; -->
					<div class="key-hero" style="box-sizing: border-box; display: flex; align-items: center; gap: 14px; padding: 14px 15px; background: var(--surface-2); border-radius: var(--r-3)">
						<!-- htmlswap-source: <div class="big-cap"&gt;{{ inspector.heroGlyph }}</div&gt; -->
						<div class="big-cap" style="box-sizing: border-box; display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 56px; height: 56px; border-radius: 9px; background: linear-gradient(#fffdf7 0%, #ebe2ce 100%); border: 1px solid #1b19172e; box-shadow: var(--shadow-cap); font-family: var(--mono); font-weight: 600; font-size: 16px">
							{inspector.heroGlyph}
						</div>
						<!-- htmlswap-source: <div class="col"&gt; -->
						<div class="col" style="box-sizing: border-box; display: flex; flex-direction: column; gap: 3px; min-width: 0">
							<!-- htmlswap-source: <div class="meta"&gt;{{ inspector.positionLabel }}</div&gt; -->
							<div class="meta" style="box-sizing: border-box; font-family: var(--mono); font-size: 11px; color: var(--ink-3); text-transform: uppercase; letter-spacing: .08em">
								{inspector.positionLabel}
							</div>
							<!-- htmlswap-source: <h2&gt;{{ inspector.bindingLabel }}</h2&gt; -->
							<h2 style="box-sizing: border-box; margin: 0; font-family: var(--mono); font-size: 17px; font-weight: 500; letter-spacing: .02em; word-break: break-word">
								{inspector.bindingLabel}
							</h2>
							{#if inspector.hasSourceLayer}
								<!-- htmlswap-source: <div class="row" style="margin-top: 2px;"&gt; -->
								<div class="row" style="box-sizing: border-box; display: flex; align-items: center; gap: 10px; margin-top: 2px">
									<!-- htmlswap-source: <span class="tag" style="{{ inspector.sourceTagStyle }}"&gt;{{ inspector.sourceLabel }}</span&gt; -->
									<span class="tag" style={`box-sizing: border-box; display: inline-flex; align-items: center; padding: 2px 8px; border-radius: 999px; font-family: var(--mono); font-size: 10px; text-transform: uppercase; letter-spacing: .07em; background: var(--surface-2); color: var(--ink-2); ${__htmlswap_style(inspector.sourceTagStyle)}`}>
										{inspector.sourceLabel}
									</span>
								</div>
							{/if}
						</div>
					</div>
					<!-- htmlswap-source: <div class="seg" role="tablist" data-htmlswap-component="tabs"&gt; -->
					<div class="seg" role="tablist" role="tablist" style="box-sizing: border-box; display: inline-flex; gap: 2px; padding: 3px; border-radius: 999px; background: var(--surface-2)">
						{#each inspector.tabs as tab, $index}
							<!-- htmlswap-source: <button id="{{ tab.buttonId }}" role="tab" aria-selected="{{ tab.selected }}" onClick="{{ tab.select }}"&gt; -->
							<button class="hs_6" role="tab" id={tab.buttonId} role="tab" aria-selected={tab.selected} style="box-sizing: border-box; font: inherit; cursor: pointer; border: 0; background: none; color: var(--ink-2); height: 28px; padding: 0 14px; border-radius: 999px; font-family: var(--mono); font-size: 12px; letter-spacing: .03em; transition: background .1s, color .1s" onclick={tab.select}>
								
                  {tab.label}
                
							</button>
						{/each}
					</div>
					{#if inspector.showBindTab}
						<!-- htmlswap-source: <div style="display: flex; flex-direction: column; gap: 14px;"&gt; -->
						<div style="box-sizing: border-box; display: flex; flex-direction: column; gap: 14px">
							{#each inspector.keycodeGroups as group, $index}
								<!-- htmlswap-source: <div class="kc-group" data-htmlswap-key="{{ group.id }}"&gt; -->
								<div class="kc-group" data-htmlswap-key={group.id} style="box-sizing: border-box; display: flex; flex-direction: column; gap: 7px">
									<!-- htmlswap-source: <div class="field-label"&gt;{{ group.name }}</div&gt; -->
									<div class="field-label" style="box-sizing: border-box; font-family: var(--mono); font-size: 10px; text-transform: uppercase; letter-spacing: .1em; color: var(--ink-3)">
										{group.name}
									</div>
									<!-- htmlswap-source: <div class="kc-grid"&gt; -->
									<div class="kc-grid" style="box-sizing: border-box; display: flex; flex-wrap: wrap; gap: 6px">
										{#each group.codes as code, $index}
											<!-- htmlswap-source: <button -->
											<button class="kc-pill hs_7" id={code.buttonId} aria-pressed={code.selected} data-htmlswap-key={code.value} style="box-sizing: border-box; font: inherit; cursor: pointer; border: 1px solid #0000; background: var(--surface-2); color: var(--ink-2); font-family: var(--mono); font-size: 11px; padding: 6px 9px; border-radius: 7px; transition: border-color .1s, background .1s" onclick={code.pick}>
												
                          {code.label}
                        
											</button>
										{/each}
									</div>
								</div>
							{/each}
						</div>
						<!-- htmlswap-source: <button id="editor-reset-base" class="btn" data-htmlswap-size="xs" data-htmlswap-tone="neutral" data-htmlswap-variant="ghost" onClick="{{ inspector.resetToBase }}"&gt; -->
						<button class="btn hs_8" id="editor-reset-base" data-htmlswap-size="xs" data-htmlswap-tone="neutral" data-htmlswap-variant="ghost" style="box-sizing: border-box; font: inherit; cursor: pointer; border: 1px solid #0000; background: none; color: var(--ink-2); display: inline-flex; align-items: center; justify-content: center; gap: 4px; height: 24px; padding: 0 8px; border-radius: var(--r-2); font-weight: 500; font-size: 11px; white-space: nowrap; transition: background .1s, border-color .1s, color .1s" onclick={inspector.resetToBase}>
							<!-- htmlswap-source: <span class="material-symbols-outlined"&gt;restart_alt</span&gt; -->
							<span class="material-symbols-outlined" style="box-sizing: border-box; font-variation-settings: &quot;FILL&quot; 0, &quot;wght&quot; 400, &quot;GRAD&quot; 0, &quot;opsz&quot; 24; font-size: 18px; line-height: 1; user-select: none; font-family: Material Symbols Outlined; font-weight: normal; font-style: normal; letter-spacing: normal; text-transform: none; display: inline-block; white-space: nowrap; word-wrap: normal; direction: ltr">
								restart_alt
							</span>
							<!-- htmlswap-source: <span&gt;Reset to base</span&gt; -->
							<span style="box-sizing: border-box">
								Reset to base
							</span>
						</button>
					{/if}
					{#if inspector.showHoldTab}
						<!-- htmlswap-source: <div style="display: flex; flex-direction: column; gap: 12px;"&gt; -->
						<div style="box-sizing: border-box; display: flex; flex-direction: column; gap: 12px">
							<!-- htmlswap-source: <div class="row" style="gap: 10px;"&gt; -->
							<div class="row" style="box-sizing: border-box; display: flex; align-items: center; gap: 10px">
								<!-- htmlswap-source: <label class="field" style="flex: 1;"&gt; -->
								<label class="field" style="box-sizing: border-box; display: flex; flex-direction: column; gap: 6px; flex: 1">
									<!-- htmlswap-source: <span class="field-label"&gt;Tap</span&gt; -->
									<span class="field-label" style="box-sizing: border-box; font-family: var(--mono); font-size: 10px; text-transform: uppercase; letter-spacing: .1em; color: var(--ink-3)">
										Tap
									</span>
									<!-- htmlswap-source: <input id="editor-hold-tap" class="input" value="{{ inspector.holdTap }}" data-htmlswap-state-owner="source" onInput="{{ inspector.updateHoldTap }}"&gt; -->
									<input class="input hs_9" id="editor-hold-tap" value={inspector.holdTap} style="box-sizing: border-box; font: inherit; height: 34px; padding: 0 12px; border-radius: var(--r-2); border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); outline: 0; width: 100%; font-family: var(--mono); font-size: 12px" oninput={inspector.updateHoldTap} />
								</label>
								<!-- htmlswap-source: <label class="field" style="flex: 1;"&gt; -->
								<label class="field" style="box-sizing: border-box; display: flex; flex-direction: column; gap: 6px; flex: 1">
									<!-- htmlswap-source: <span class="field-label"&gt;Hold</span&gt; -->
									<span class="field-label" style="box-sizing: border-box; font-family: var(--mono); font-size: 10px; text-transform: uppercase; letter-spacing: .1em; color: var(--ink-3)">
										Hold
									</span>
									<!-- htmlswap-source: <input id="editor-hold-hold" class="input" value="{{ inspector.holdHold }}" data-htmlswap-state-owner="source" onInput="{{ inspector.updateHoldHold }}"&gt; -->
									<input class="input hs_10" id="editor-hold-hold" value={inspector.holdHold} style="box-sizing: border-box; font: inherit; height: 34px; padding: 0 12px; border-radius: var(--r-2); border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); outline: 0; width: 100%; font-family: var(--mono); font-size: 12px" oninput={inspector.updateHoldHold} />
								</label>
							</div>
							<!-- htmlswap-source: <div class="slider-row"&gt; -->
							<div class="slider-row" style="box-sizing: border-box; display: flex; align-items: center; gap: 12px">
								<!-- htmlswap-source: <label for="editor-tap-term"&gt;Tap term</label&gt; -->
								<label for="editor-tap-term" style="box-sizing: border-box; flex-shrink: 0; width: 88px; font-family: var(--mono); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-3)">
									Tap term
								</label>
								<!-- htmlswap-source: <input id="editor-tap-term" type="range" min="100" max="300" value="{{ inspector.tapTerm }}" data-htmlswap-state-owner="source" onInput="{{ inspector.updateTapTerm }}"&gt; -->
								<input class="hs_11" id="editor-tap-term" type="range" min="100" max="300" value={inspector.tapTerm} style="box-sizing: border-box; font: inherit; flex: 1; -webkit-appearance: none; appearance: none; height: 4px; border-radius: 999px; background: var(--surface-3); outline: none" oninput={inspector.updateTapTerm} />
								<!-- htmlswap-source: <span class="val"&gt;{{ inspector.tapTerm }}</span&gt; -->
								<span class="val" style="box-sizing: border-box; flex-shrink: 0; width: 46px; text-align: right; font-family: var(--mono); font-size: 12px">
									{inspector.tapTerm}
								</span>
							</div>
						</div>
					{/if}
					{#if inspector.showNotesTab}
						<!-- htmlswap-source: <textarea id="editor-key-notes" class="input" rows="5" style="height: auto; padding: 12px; resize: none;" placeholder="Notes on this key..." onInput="{{ inspector.updateNotes }}"&gt;</textarea&gt; -->
						<textarea class="input hs_12" bind:value={editor_key_notes} id="editor-key-notes" rows="5" placeholder="Notes on this key..." style="box-sizing: border-box; height: auto; padding: 12px; border-radius: var(--r-2); border: 1px solid var(--line-2); background: var(--surface); color: var(--ink); outline: 0; width: 100%; font-family: var(--mono); font-size: 12px; resize: none" oninput={(event) => { editor_key_notes = event.currentTarget?.value ?? ''; inspector.updateNotes?.(event); }}>
						</textarea>
					{/if}
					<!-- htmlswap-source: <div class="divider"&gt;</div&gt; -->
					<div class="divider" style="box-sizing: border-box; height: 1px; background: var(--line)">
					</div>
					<!-- htmlswap-source: <div class="lens-hint"&gt; -->
					<div class="lens-hint" style="box-sizing: border-box; display: flex; align-items: center; gap: 8px; padding: 10px 12px; background: var(--surface-2); border-radius: var(--r-2); font-size: 12px; color: var(--ink-2)">
						<!-- htmlswap-source: <span class="led-chip" style="{{ inspector.ledStyle }}"&gt;</span&gt; -->
						<span class="led-chip" style={`box-sizing: border-box; width: 56px; height: 56px; border-radius: 9px; border: 1px solid #1b191733; box-shadow: inset 0 -4px 6px #0000001f; flex-shrink: 0; ${__htmlswap_style(inspector.ledStyle)}`}>
						</span>
						<!-- htmlswap-source: <span&gt;{{ inspector.ledLabel }}</span&gt; -->
						<span style="box-sizing: border-box">
							{inspector.ledLabel}
						</span>
						<!-- htmlswap-source: <div class="spacer"&gt;</div&gt; -->
						<div class="spacer" style="box-sizing: border-box; flex: 1">
						</div>
						<!-- htmlswap-source: <button id="editor-edit-color" class="btn" data-htmlswap-size="xs" data-htmlswap-tone="neutral" data-htmlswap-variant="ghost" onClick="{{ inspector.editColor }}"&gt; -->
						<button class="btn hs_13" id="editor-edit-color" data-htmlswap-size="xs" data-htmlswap-tone="neutral" data-htmlswap-variant="ghost" style="box-sizing: border-box; font: inherit; cursor: pointer; border: 1px solid #0000; background: none; color: var(--ink-2); display: inline-flex; align-items: center; justify-content: center; gap: 4px; height: 24px; padding: 0 8px; border-radius: var(--r-2); font-weight: 500; font-size: 11px; white-space: nowrap; transition: background .1s, border-color .1s, color .1s" onclick={inspector.editColor}>
							<!-- htmlswap-source: <span class="material-symbols-outlined"&gt;lightbulb</span&gt; -->
							<span class="material-symbols-outlined" style="box-sizing: border-box; font-variation-settings: &quot;FILL&quot; 0, &quot;wght&quot; 400, &quot;GRAD&quot; 0, &quot;opsz&quot; 24; font-size: 16px; line-height: 1; user-select: none; color: var(--ink-3); font-family: Material Symbols Outlined; font-weight: normal; font-style: normal; letter-spacing: normal; text-transform: none; display: inline-block; white-space: nowrap; word-wrap: normal; direction: ltr">
								lightbulb
							</span>
							<!-- htmlswap-source: <span&gt;Edit color</span&gt; -->
							<span style="box-sizing: border-box">
								Edit color
							</span>
						</button>
					</div>
				{:else}
					<!-- htmlswap-source: <div class="key-hero"&gt; -->
					<div class="key-hero" style="box-sizing: border-box; display: flex; align-items: center; gap: 14px; padding: 14px 15px; background: var(--surface-2); border-radius: var(--r-3)">
						<!-- htmlswap-source: <div class="{{ lighting.heroChipClass }}" style="{{ lighting.heroChipStyle }}"&gt; -->
						<div class="{{ lighting.heroChipClass }}" style={`box-sizing: border-box; ${__htmlswap_style(lighting.heroChipStyle)}`}>
							{#if lighting.heroShowsIcon}
								<!-- htmlswap-source: <span class="material-symbols-outlined"&gt;{{ lighting.heroIcon }}</span&gt; -->
								<span class="material-symbols-outlined" style="box-sizing: border-box; font-variation-settings: &quot;FILL&quot; 0, &quot;wght&quot; 400, &quot;GRAD&quot; 0, &quot;opsz&quot; 24; font-size: 24px; line-height: 1; user-select: none; font-family: Material Symbols Outlined; font-weight: normal; font-style: normal; letter-spacing: normal; text-transform: none; display: inline-block; white-space: nowrap; word-wrap: normal; direction: ltr">
									{lighting.heroIcon}
								</span>
							{/if}
						</div>
						<!-- htmlswap-source: <div class="col"&gt; -->
						<div class="col" style="box-sizing: border-box; display: flex; flex-direction: column; gap: 3px; min-width: 0">
							<!-- htmlswap-source: <div class="meta"&gt;{{ lighting.selectionLabel }}</div&gt; -->
							<div class="meta" style="box-sizing: border-box; font-family: var(--mono); font-size: 11px; color: var(--ink-3); text-transform: uppercase; letter-spacing: .08em">
								{lighting.selectionLabel}
							</div>
							<!-- htmlswap-source: <h2 style="font-size: 15px;"&gt;{{ lighting.colorLabel }}</h2&gt; -->
							<h2 style="box-sizing: border-box; margin: 0; font-family: var(--mono); font-size: 15px; font-weight: 500; letter-spacing: .02em; word-break: break-word">
								{lighting.colorLabel}
							</h2>
						</div>
					</div>
					<!-- htmlswap-source: <div class="field"&gt; -->
					<div class="field" style="box-sizing: border-box; display: flex; flex-direction: column; gap: 6px">
						<!-- htmlswap-source: <span class="field-label"&gt;Paint selection</span&gt; -->
						<span class="field-label" style="box-sizing: border-box; font-family: var(--mono); font-size: 10px; text-transform: uppercase; letter-spacing: .1em; color: var(--ink-3)">
							Paint selection
						</span>
						<!-- htmlswap-source: <div class="swatches"&gt; -->
						<div class="swatches" style="box-sizing: border-box; display: flex; flex-wrap: wrap; gap: 8px">
							{#each lighting.swatches as swatch, $index}
								<!-- htmlswap-source: <button -->
								<button class="{{ swatch.className }}" id={swatch.buttonId} aria-pressed={swatch.selected} title={swatch.label} data-htmlswap-key={swatch.id} style={`box-sizing: border-box; font: inherit; cursor: pointer; border: 0; background: none; color: inherit; ${__htmlswap_style(swatch.style)}`} onclick={swatch.pick}>
									{#if swatch.isOff}
										<!-- htmlswap-source: <span class="material-symbols-outlined"&gt;power_settings_new</span&gt; -->
										<span class="material-symbols-outlined" style="box-sizing: border-box; font-variation-settings: &quot;FILL&quot; 0, &quot;wght&quot; 400, &quot;GRAD&quot; 0, &quot;opsz&quot; 24; font-size: 24px; line-height: 1; user-select: none; font-family: Material Symbols Outlined; font-weight: normal; font-style: normal; letter-spacing: normal; text-transform: none; display: inline-block; white-space: nowrap; word-wrap: normal; direction: ltr">
											power_settings_new
										</span>
									{/if}
								</button>
							{/each}
						</div>
					</div>
					<!-- htmlswap-source: <div class="row" style="gap: 6px;"&gt; -->
					<div class="row" style="box-sizing: border-box; display: flex; align-items: center; gap: 6px">
						<!-- htmlswap-source: <button id="editor-select-all" class="btn" data-htmlswap-size="xs" data-htmlswap-tone="neutral" data-htmlswap-variant="ghost" style="flex: 1;" onClick="{{ lighting.selectAll }}"&gt; -->
						<button class="btn hs_14" id="editor-select-all" data-htmlswap-size="xs" data-htmlswap-tone="neutral" data-htmlswap-variant="ghost" style="box-sizing: border-box; font: inherit; cursor: pointer; border: 1px solid #0000; background: none; color: var(--ink-2); display: inline-flex; align-items: center; justify-content: center; gap: 4px; height: 24px; padding: 0 8px; border-radius: var(--r-2); font-weight: 500; font-size: 11px; white-space: nowrap; transition: background .1s, border-color .1s, color .1s; flex: 1" onclick={lighting.selectAll}>
							<!-- htmlswap-source: <span class="material-symbols-outlined"&gt;select_all</span&gt; -->
							<span class="material-symbols-outlined" style="box-sizing: border-box; font-variation-settings: &quot;FILL&quot; 0, &quot;wght&quot; 400, &quot;GRAD&quot; 0, &quot;opsz&quot; 24; font-size: 18px; line-height: 1; user-select: none; font-family: Material Symbols Outlined; font-weight: normal; font-style: normal; letter-spacing: normal; text-transform: none; display: inline-block; white-space: nowrap; word-wrap: normal; direction: ltr">
								select_all
							</span>
							<!-- htmlswap-source: <span&gt;Select all</span&gt; -->
							<span style="box-sizing: border-box">
								Select all
							</span>
						</button>
						<!-- htmlswap-source: <button id="editor-clear-selection" class="btn" data-htmlswap-size="xs" data-htmlswap-tone="neutral" data-htmlswap-variant="ghost" style="flex: 1;" onClick="{{ lighting.clearSelection }}"&gt; -->
						<button class="btn hs_15" id="editor-clear-selection" data-htmlswap-size="xs" data-htmlswap-tone="neutral" data-htmlswap-variant="ghost" style="box-sizing: border-box; font: inherit; cursor: pointer; border: 1px solid #0000; background: none; color: var(--ink-2); display: inline-flex; align-items: center; justify-content: center; gap: 4px; height: 24px; padding: 0 8px; border-radius: var(--r-2); font-weight: 500; font-size: 11px; white-space: nowrap; transition: background .1s, border-color .1s, color .1s; flex: 1" onclick={lighting.clearSelection}>
							<!-- htmlswap-source: <span class="material-symbols-outlined"&gt;deselect</span&gt; -->
							<span class="material-symbols-outlined" style="box-sizing: border-box; font-variation-settings: &quot;FILL&quot; 0, &quot;wght&quot; 400, &quot;GRAD&quot; 0, &quot;opsz&quot; 24; font-size: 18px; line-height: 1; user-select: none; font-family: Material Symbols Outlined; font-weight: normal; font-style: normal; letter-spacing: normal; text-transform: none; display: inline-block; white-space: nowrap; word-wrap: normal; direction: ltr">
								deselect
							</span>
							<!-- htmlswap-source: <span&gt;Clear</span&gt; -->
							<span style="box-sizing: border-box">
								Clear
							</span>
						</button>
					</div>
					<!-- htmlswap-source: <div class="slider-row"&gt; -->
					<div class="slider-row" style="box-sizing: border-box; display: flex; align-items: center; gap: 12px">
						<!-- htmlswap-source: <label for="editor-brightness"&gt;Brightness</label&gt; -->
						<label for="editor-brightness" style="box-sizing: border-box; flex-shrink: 0; width: 88px; font-family: var(--mono); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-3)">
							Brightness
						</label>
						<!-- htmlswap-source: <input id="editor-brightness" type="range" min="0" max="100" value="{{ lighting.brightness }}" data-htmlswap-state-owner="source" onInput="{{ lighting.updateBrightness }}"&gt; -->
						<input class="hs_16" id="editor-brightness" type="range" min="0" max="100" value={lighting.brightness} style="box-sizing: border-box; font: inherit; flex: 1; -webkit-appearance: none; appearance: none; height: 4px; border-radius: 999px; background: var(--surface-3); outline: none" oninput={lighting.updateBrightness} />
						<!-- htmlswap-source: <span class="val"&gt;{{ lighting.brightness }}</span&gt; -->
						<span class="val" style="box-sizing: border-box; flex-shrink: 0; width: 46px; text-align: right; font-family: var(--mono); font-size: 12px">
							{lighting.brightness}
						</span>
					</div>
					<!-- htmlswap-source: <div class="divider"&gt;</div&gt; -->
					<div class="divider" style="box-sizing: border-box; height: 1px; background: var(--line)">
					</div>
					<!-- htmlswap-source: <div class="field"&gt; -->
					<div class="field" style="box-sizing: border-box; display: flex; flex-direction: column; gap: 6px">
						<!-- htmlswap-source: <span class="field-label"&gt;Global effect</span&gt; -->
						<span class="field-label" style="box-sizing: border-box; font-family: var(--mono); font-size: 10px; text-transform: uppercase; letter-spacing: .1em; color: var(--ink-3)">
							Global effect
						</span>
						<!-- htmlswap-source: <div class="seg" role="tablist" data-htmlswap-component="tabs"&gt; -->
						<div class="seg" role="tablist" role="tablist" style="box-sizing: border-box; display: inline-flex; gap: 2px; padding: 3px; border-radius: 999px; background: var(--surface-2)">
							{#each lighting.effects as effect, $index}
								<!-- htmlswap-source: <button id="{{ effect.buttonId }}" role="tab" aria-selected="{{ effect.selected }}" onClick="{{ effect.select }}"&gt; -->
								<button class="hs_17" role="tab" id={effect.buttonId} role="tab" aria-selected={effect.selected} style="box-sizing: border-box; font: inherit; cursor: pointer; border: 0; background: none; color: var(--ink-2); height: 28px; padding: 0 14px; border-radius: 999px; font-family: var(--mono); font-size: 12px; letter-spacing: .03em; transition: background .1s, color .1s" onclick={effect.select}>
									
                    {effect.label}
                  
								</button>
							{/each}
						</div>
					</div>
					<!-- htmlswap-source: <div class="slider-row"&gt; -->
					<div class="slider-row" style="box-sizing: border-box; display: flex; align-items: center; gap: 12px">
						<!-- htmlswap-source: <label for="editor-rgb-speed"&gt;Speed</label&gt; -->
						<label for="editor-rgb-speed" style="box-sizing: border-box; flex-shrink: 0; width: 88px; font-family: var(--mono); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-3)">
							Speed
						</label>
						<!-- htmlswap-source: <input id="editor-rgb-speed" type="range" min="0" max="100" value="{{ lighting.speed }}" data-htmlswap-state-owner="source" onInput="{{ lighting.updateSpeed }}"&gt; -->
						<input class="hs_18" id="editor-rgb-speed" type="range" min="0" max="100" value={lighting.speed} style="box-sizing: border-box; font: inherit; flex: 1; -webkit-appearance: none; appearance: none; height: 4px; border-radius: 999px; background: var(--surface-3); outline: none" oninput={lighting.updateSpeed} />
						<!-- htmlswap-source: <span class="val"&gt;{{ lighting.speed }}</span&gt; -->
						<span class="val" style="box-sizing: border-box; flex-shrink: 0; width: 46px; text-align: right; font-family: var(--mono); font-size: 12px">
							{lighting.speed}
						</span>
					</div>
					<!-- htmlswap-source: <div class="row" style="justify-content: space-between;"&gt; -->
					<div class="row" style="box-sizing: border-box; display: flex; align-items: center; gap: 10px; justify-content: space-between">
						<!-- htmlswap-source: <span style="font-size: 12px; color: var(- -ink-2);"&gt;Tint by active layer</span&gt; -->
						<span style="box-sizing: border-box; font-size: 12px; color: var(--ink-2)">
							Tint by active layer
						</span>
						<!-- htmlswap-source: <button id="editor-tint-layer" class="switch" role="switch" aria-checked="{{ lighting.tintByLayer }}" data-htmlswap-component="switch" onClick="{{ lighting.toggleTintByLayer }}"&gt; -->
						<button class="switch" role="switch" id="editor-tint-layer" role="switch" aria-checked={lighting.tintByLayer} style="box-sizing: border-box; font: inherit; cursor: pointer; border: 1px solid var(--line-2); background: var(--surface-3); color: inherit; display: inline-flex; align-items: center; width: 38px; height: 22px; padding: 2px; border-radius: 999px; justify-content: flex-start; transition: background .12s, justify-content; flex-shrink: 0" onclick={lighting.toggleTintByLayer}>
							<!-- htmlswap-source: <span class="knob"&gt;</span&gt; -->
							<span class="knob" style="box-sizing: border-box; width: 16px; height: 16px; border-radius: 999px; background: var(--surface); box-shadow: 0 1px 2px #00000040">
							</span>
						</button>
					</div>
				{/if}
			</div>
		</div>
	</aside>
</section>
