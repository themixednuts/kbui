<script lang="ts" module>
	import { type VariantProps, tv } from "tailwind-variants";

	const trackStyles =
		"[&_[data-slot=slider-track]]:h-2 [&_[data-slot=slider-track]]:border [&_[data-slot=slider-track]]:border-line-2 [&_[data-slot=slider-track]]:bg-paper-2 [&_[data-slot=slider-range]]:bg-coral [&_[data-slot=slider-thumb]]:size-3.5 [&_[data-slot=slider-thumb]]:border-2 [&_[data-slot=slider-thumb]]:border-coral [&_[data-slot=slider-thumb]]:bg-[#fffcf5] [&_[data-slot=slider-thumb]]:shadow-[var(--shadow-cap)] [&_[data-slot=slider-thumb]:hover]:ring-4 [&_[data-slot=slider-thumb]:hover]:ring-coral/20";

	export const sliderFieldVariants = tv({
		slots: {
			root: "grid items-center",
			head: "flex items-baseline justify-between gap-3",
			label: "font-mono text-[11px] uppercase tracking-[0.08em] text-muted-foreground",
			track: `w-full min-w-0 py-0.5 ${trackStyles}`,
			value: "flex items-baseline justify-end gap-1.5 text-right font-mono tabular-nums text-foreground",
			valueNumber: "font-semibold",
			defaultBadge: "rounded-[5px] border border-line-2 bg-paper-2 px-1.5 py-[1px] text-[10px] leading-none text-ink-3",
			bounds: "grid grid-cols-[auto_1fr_auto] items-center gap-2 font-mono text-[10px] tracking-[0.04em] text-muted-foreground/90",
			resetHint: "truncate text-center text-ink-3",
		},
		variants: {
			layout: {
				inline: {},
				stacked: {
					root: "my-0 gap-y-2",
					head: "col-span-full",
					label: "normal-case tracking-[0.02em] text-ink-2",
					track: "col-span-full",
					bounds: "col-span-full -mt-0.5",
				},
			},
			compact: {
				true: {
					root: "my-0 min-h-6 grid-cols-[minmax(3.25rem,auto)_1fr_auto] gap-x-2",
					value: "w-8 text-[11px]",
					defaultBadge: "hidden",
				},
				false: {
					root: "my-3 grid-cols-[minmax(5.5rem,auto)_1fr_auto] gap-x-3",
					value: "min-w-[3.25rem] text-xs",
				},
			},
		},
		compoundVariants: [
			{
				layout: "stacked",
				class: {
					root: "grid-cols-1",
				},
			},
		],
		defaultVariants: {
			layout: "inline",
			compact: false,
		},
	});

	export type SliderFieldVariants = VariantProps<typeof sliderFieldVariants>;
</script>

<script lang="ts">
	import { Slider } from "./slider/index.js";
	import { cn } from "$lib/utils.js";

	type Props = {
		label: string;
		value: number;
		min?: number;
		max?: number;
		step?: number;
		disabled?: boolean;
		suffix?: string;
		compact?: boolean;
		/** Full-width slider with min/max hints — clearer for settings panels. */
		showBounds?: boolean;
		/** Double-clicking the field resets to this value and exposes default feedback. */
		defaultValue?: number;
		defaultLabel?: string;
		class?: string;
		onValueChange: (value: number) => void;
	};

	let {
		label,
		value,
		min = 0,
		max = 100,
		step = 1,
		disabled = false,
		suffix = "",
		compact = false,
		showBounds = false,
		defaultValue,
		defaultLabel = "default",
		class: extra = "",
		onValueChange,
	}: Props = $props();

	const layout = $derived(showBounds ? "stacked" : "inline");
	const styles = $derived(sliderFieldVariants({ compact: showBounds ? false : compact, layout }));
	const hasDefault = $derived(typeof defaultValue === "number");
	const defaultDelta = $derived(hasDefault ? value - (defaultValue as number) : 0);
	const resetTitle = $derived(
		hasDefault ? `Double-click to reset ${label} to ${formatWithSuffix(defaultValue as number)}` : undefined,
	);
	const defaultFeedback = $derived(
		!hasDefault
			? ""
			: defaultDelta === 0
				? defaultLabel
				: `${defaultDelta > 0 ? "+" : ""}${formatWithSuffix(defaultDelta)}`,
	);

	function formatValue(next: number) {
		return Number.isInteger(next) ? String(next) : next.toFixed(2).replace(/\.?0+$/, "");
	}

	function formatWithSuffix(next: number) {
		return `${formatValue(next)}${suffix}`;
	}

	function handleValueChange(next: number) {
		onValueChange(next);
	}

	function resetToDefault(event: MouseEvent) {
		if (!hasDefault || disabled) return;
		event.preventDefault();
		event.stopPropagation();
		onValueChange(defaultValue as number);
	}
</script>

<div class={cn(styles.root(), extra)} title={resetTitle}>
	{#if showBounds}
		<div class={styles.head()}>
			<span class={styles.label()}>{label}</span>
			<span class={styles.value()} aria-live="polite">
				<span class={styles.valueNumber()}>{formatWithSuffix(value)}</span>
				{#if hasDefault}
					<span class={styles.defaultBadge()}>{defaultFeedback}</span>
				{/if}
			</span>
		</div>
		<Slider
			type="single"
			{min}
			{max}
			{step}
			{disabled}
			{value}
			title={resetTitle}
			ondblclick={resetToDefault}
			onValueChange={handleValueChange}
			class={styles.track()}
		/>
		<div class={styles.bounds()}>
			<span>{min}{suffix}</span>
			{#if hasDefault}
				<span class={styles.resetHint()}>{defaultLabel} {formatWithSuffix(defaultValue as number)} · dbl-click reset</span>
			{:else}
				<span></span>
			{/if}
			<span>{max}{suffix}</span>
		</div>
	{:else}
		<span class={styles.label()}>{label}</span>
		<Slider
			type="single"
			{min}
			{max}
			{step}
			{disabled}
			{value}
			title={resetTitle}
			ondblclick={resetToDefault}
			onValueChange={handleValueChange}
			class={styles.track()}
		/>
		<span class={styles.value()} aria-live="polite">
			<span class={styles.valueNumber()}>{formatWithSuffix(value)}</span>
			{#if hasDefault}
				<span class={styles.defaultBadge()}>{defaultFeedback}</span>
			{/if}
		</span>
	{/if}
</div>
