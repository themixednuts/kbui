# kbui Monkeytype Tagger Extension

This directory is a standalone WXT package. It intentionally has its own `package.json`,
lockfile, and `node_modules` so WXT resolves real Vite instead of the root app's Vite+
alias.

Use extension-local commands from this directory:

```sh
npm install
npm run build
npm test
```

Do not add `extension/` as a root workspace member. The root app continues to use `vp`
commands only.
