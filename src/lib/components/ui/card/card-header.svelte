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
	data-slot="card-header"
	class={cn(
		"flex min-w-0 flex-wrap items-center gap-2.5 border-b border-border px-[18px] py-3.5",
		"[&_.seg]:min-w-0 [&_.seg]:max-w-full [&_.seg]:flex-1 [&_.seg]:overflow-x-auto",
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</div>
