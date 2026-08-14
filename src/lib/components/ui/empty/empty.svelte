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
	data-slot="empty"
	class={cn(
		"flex w-full min-w-0 flex-col items-center justify-center gap-kb-8 rounded-lg border border-dashed border-line-2 p-kb-16 text-center text-balance text-ink-3",
		className
	)}
	{...restProps}
>
	{@render children?.()}
</div>
