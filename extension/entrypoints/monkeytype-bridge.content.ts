import { defineContentScript } from "wxt/utils/define-content-script";

import { installMonkeytypeResultBridge } from "../src/monkeytype/result-bridge";

export default defineContentScript({
  matches: ["https://monkeytype.com/*"],
  world: "MAIN",
  runAt: "document_start",
  main() {
    installMonkeytypeResultBridge(window);
  },
});
