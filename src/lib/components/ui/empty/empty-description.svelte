<script lang="ts">
	import { cn, type WithElementRef } from "$lib/utils.js";
	import type { HTMLAttributes } from "svelte/elements";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLDivElement>> = $props();
</script>

<div
	bind:this={ref}
	data-slot="empty-description"
	class={cn(
		"text-kb-12 leading-[1.45] text-ink-3 [&>a]:underline [&>a]:underline-offset-4 [&>a:hover]:text-ink",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
