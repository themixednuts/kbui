<script lang="ts">
	import ChevronDownIcon from '@lucide/svelte/icons/chevron-down';
	import { cn } from "$lib/utils.js";
	import type { HTMLSelectAttributes } from "svelte/elements";

	type NativeSelectProps = Omit<HTMLSelectAttributes, "size"> & {
		ref?: HTMLSelectElement | null;
		size?: "sm" | "default";
	};

	let {
		ref = $bindable(null),
		value = $bindable(),
		class: className,
		size = "default",
		children,
		...restProps
	}: NativeSelectProps = $props();
</script>

<div
	class={cn(
		"group/native-select relative w-fit min-w-0 has-[select:disabled]:opacity-50",
		className,
	)}
	data-slot="native-select-wrapper"
	data-size={size}
>
	<select
		bind:value
		bind:this={ref}
		data-slot="native-select"
		data-size={size}
		class={cn(
			"h-[var(--control-height)] w-full min-w-0 appearance-none rounded-md border border-line-2 bg-surface py-0 pr-kb-28 pl-kb-10 font-mono text-[12px] text-ink shadow-xs outline-none transition-[color,box-shadow,border-color] select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-[size=sm]:h-[var(--control-height-sm)] disabled:pointer-events-none disabled:cursor-not-allowed",
			className,
		)}
		{...restProps}
	>
		{@render children?.()}
	</select>
	<ChevronDownIcon
		class="pointer-events-none absolute top-1/2 right-kb-10 size-4 -translate-y-1/2 text-ink-3"
		aria-hidden
		data-slot="native-select-icon"
	/>
</div>
