<script lang="ts">
	import { browser } from '$app/environment';
	import favicon from '$lib/assets/favicon.svg';
	import { Toaster } from '$lib/components/ui/sonner/index.js';
	import '../app.css';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children()}

{#if browser}
	<Toaster
		theme="light"
		position="top-right"
		closeButton
		expand
		visibleToasts={4}
		offset={{ top: 64, right: 14 }}
	/>
{/if}
