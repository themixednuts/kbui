<script lang="ts">
	import { Switch as SwitchPrimitive } from "bits-ui";
	import { cn, type WithoutChildrenOrChild } from "$lib/utils.js";

	let {
		ref = $bindable(null),
		class: className,
		checked = $bindable(false),
		size = "default",
		...restProps
	}: WithoutChildrenOrChild<SwitchPrimitive.RootProps> & {
		size?: "sm" | "default";
	} = $props();
</script>

<SwitchPrimitive.Root
	bind:ref
	bind:checked
	data-slot="switch"
	data-size={size}
	class={cn(
		"relative inline-flex shrink-0 items-center rounded-full border border-line-2 bg-surface-3 shadow-xs outline-none transition-[background-color,border-color,box-shadow] after:absolute after:-inset-x-3 after:-inset-y-2 focus-visible:border-coral focus-visible:ring-3 focus-visible:ring-coral/25 data-[state=checked]:border-coral data-[state=checked]:bg-coral data-[state=unchecked]:border-line-2 data-[state=unchecked]:bg-surface-3 data-[size=default]:h-[18.4px] data-[size=default]:w-[32px] data-[size=sm]:h-[14px] data-[size=sm]:w-[24px] data-disabled:cursor-not-allowed data-disabled:opacity-50 peer group/switch",
		className
	)}
	{...restProps}
>
	<SwitchPrimitive.Thumb
		data-slot="switch-thumb"
		class="pointer-events-none block rounded-full bg-ink ring-0 transition-[background-color,transform] data-[state=checked]:bg-on-accent data-[state=unchecked]:bg-ink data-[state=checked]:translate-x-[calc(100%-2px)] data-[state=unchecked]:translate-x-0 group-data-[size=default]/switch:size-4 group-data-[size=sm]/switch:size-3 rtl:data-[state=checked]:translate-x-[calc(-100%+2px)]"
	/>
</SwitchPrimitive.Root>
