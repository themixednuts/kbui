# CSS migration 2f: Connect

## Scope

- Converted `src/routes/(app)/connect/+page.svelte` scoped CSS to Tailwind v4 utility classes.
- Deleted the route-local `<style>` block.
- Kept the existing global route shell/hero classes (`connect-view`, `connect-onboarding`, `connect-copy`, `connect-card`, `eyebrow`, `accent-word`) in place because they are owned by `src/app.css`, not the removed scoped block.

## Notes

- Retained `:global`: none.
- DEV gates: intact. Both `{#if import.meta.env.DEV}` guards remain around the demo VIA/ZMK rows and the mock-target footer.
- Production capture: `connect.png` contains only the real options: Connect device, Connect over Bluetooth (ZMK), Connect over USB (ZMK), Load VIA JSON, and Continue without a device.

## Verification

- `vp install`: passed.
- `vp check`: passed, all 177 files formatted and no warnings/lint/type errors in 245 files.
- `vp run svelte:check`: passed, 6002 files checked with 0 errors and 0 warnings.
- `vp build`: passed.
- `vp test`: passed, 37 test files and 194 tests.
- `vp run capture`: passed, 8/8 screenshots captured including `connect.png`.
