# CSS migration 2g-i: Versions

## Scope

- Converted `src/routes/(app)/versions/+page.svelte` scoped CSS to Tailwind v4 utility classes.
- Deleted the route-local `<style>` block.
- Preserved the Versions screen logic and de-mock behavior, including empty save-point inputs and the real `Flash this` flow.

## Notes

- Retained `:global`: none.
- `versions.png` was compared against the pre-migration capture and matched exactly: 0 differing pixels.
- A few component-slot utilities use important modifiers where needed to preserve the old scoped CSS over Card/Input base styles.

## Verification

- `vp check`: passed, all 177 files formatted and no warnings/lint/type errors in 245 files.
- `vp run svelte:check`: passed, 6002 files checked with 0 errors and 0 warnings.
- `vp build`: passed.
- `vp test`: passed, 37 test files and 194 tests.
- `vp run capture`: passed, 8/8 screenshots captured including `versions.png`.
