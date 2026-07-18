<script lang="ts">
	import type { HTMLAttributes } from "svelte/elements";
	import { cn, type WithElementRef } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		children,
		...restProps
	}: WithElementRef<HTMLAttributes<HTMLHeadingElement>> = $props();
</script>

<h3
	bind:this={ref}
	data-slot="card-title"
	class={cn(
		"m-0 min-w-0 flex-[0_1_auto] text-kb-14 font-semibold leading-tight text-foreground [text-box:trim-both_cap_alphabetic]",
		className,
	)}
	{...restProps}
>
	{@render children?.()}
</h3>
