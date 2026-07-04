# De-Mock 1b Report

Sub-wave 1b keeps the mock harness in-tree for tests and local dev, but removes mock transports from the production bundle and normal user paths.

## Shipping Importer Audit

Audit command:

```powershell
rg -n "transport-mock|transport-mock-zmk|mock-device|createMockViaTransport|createMockZmkStudioTransport" src -g '!*.test.ts' -g '!*.spec.ts' -g '!tests/**'
```

Shipping importer found:

- `src/routes/(app)/connect/+page.svelte` statically imported `$lib/keyboard/transport-mock` and `$lib/keyboard/transport-mock-zmk` for the demo VIA and demo ZMK Connect buttons.

Other matches were the mock module definitions themselves, CSS/doc references, or the now DEV-gated dynamic imports in the Connect route. `src/lib/keyboard/mock-device.ts` had no shipping importer.

Post-change static import check:

```powershell
rg -n 'from "\$lib/keyboard/(transport-mock|transport-mock-zmk|mock-device)"' src -g '!*.test.ts' -g '!*.spec.ts' -g '!tests/**'
```

Result:

```text
ZERO STATIC SHIPPING IMPORTS
```

## Dev-Gating Pattern

`src/routes/(app)/connect/+page.svelte` no longer has top-level mock transport imports. The demo handlers now start with a production-dead DEV guard and lazy-load the mock modules only inside that guarded path:

```ts
function useDemoDevice() {
  if (!import.meta.env.DEV) return;

  void runAction("mock", async () => {
    const { createMockViaTransport, mockViaBoards } = await import(
      "$lib/keyboard/transport-mock"
    );
    // demo connect flow
  });
}
```

The ZMK demo handler uses the same pattern for `$lib/keyboard/transport-mock-zmk`.

The demo VIA button, demo ZMK button, and mock-target footer are wrapped in `{#if import.meta.env.DEV}`. The production Connect intro copy was also changed so normal users do not see a mock-device offer.

The real WebHID VIA, real ZMK BLE, and real ZMK serial connect paths were not changed.

## Mock Module Headers

Added a DEV/TEST-only header to:

- `src/lib/keyboard/transport-mock.ts`
- `src/lib/keyboard/transport-mock-zmk.ts`
- `src/lib/keyboard/mock-device.ts`

## Flash Mock-Target Handling

The only non-test path found that could create a mock online keyboard state was the Connect demo transport path. That path is now DEV-gated and production-dead, so production cannot select or create a mock flash target through normal app UI.

No separate flash UI path creates a mock/simulated flash target. The existing `mockOnline` validation guard in `src/lib/keyboard/flash-validation.ts` remains in place and now documents that it catches accidental dev/test harness flash attempts if mock state reaches validation. Real flash validation and UF2 logic were left unchanged.

## Production Bundle Evidence

After the production build used by capture, client assets were checked with:

```powershell
rg -n "createMockViaTransport|createMockZmkStudioTransport|ZMK Studio mock 4c-i|mock-via:|mock-zmk-studio" .svelte-kit/output/client; if ($LASTEXITCODE -eq 1) { "ZERO MATCHES in .svelte-kit/output/client"; exit 0 }; exit $LASTEXITCODE
```

Result:

```text
ZERO MATCHES in .svelte-kit/output/client
```

Extra sanity check across all SvelteKit output also found zero matches.

## Verification

- `vp install`: passed.
- `vp check`: passed; all 174 files formatted, no warnings/lint/type errors in 242 files.
- `vp run svelte:check`: passed; 0 errors, 0 warnings.
- `vp build`: passed.
- `vp test`: passed; 36 test files, 180 tests.
- `vp run capture`: passed; 8/8 visual captures.

No git commit was created.
