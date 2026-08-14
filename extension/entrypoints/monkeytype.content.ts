import "../src/ui/tagger-host.css";

import { mount, unmount } from "svelte";
import { writable } from "svelte/store";
import { createShadowRootUi } from "wxt/utils/content-script-ui/shadow-root";
import { defineContentScript } from "wxt/utils/define-content-script";

import {
  createMonkeytypeCaptureObserver,
  type ParsedMonkeytypeResult
} from "../src/monkeytype/capture";
import {
  readMonkeytypeIdentityMessage,
  type MonkeytypeResultIdentity
} from "../src/monkeytype/result-id";
import {
  sendBackgroundMessage,
  type ContentRunState,
  type RunCapturePostResult
} from "../src/kbgui/messages";
import Tagger from "../src/ui/Tagger.svelte";

export default defineContentScript({
  matches: ["https://monkeytype.com/*"],
  runAt: "document_idle",
  cssInjectionMode: "ui",
  async main(ctx) {
    const runState = writable<ContentRunState>({ status: "idle" });
    const ui = await createShadowRootUi(ctx, {
      name: "kbgui-monkeytype-tagger",
      position: "inline",
      anchor: "body",
      isolateEvents: true,
      onMount: (container) => mount(Tagger, { target: container, props: { runState } }),
      onRemove: (app) => {
        if (app) void unmount(app);
      }
    });

    ui.mount();

    let latestIdentity: MonkeytypeResultIdentity | null = null;
    const onIdentity = (event: MessageEvent) => {
      if (event.source !== window) return;
      const identity = readMonkeytypeIdentityMessage(event.data);
      if (identity) latestIdentity = identity;
    };
    ctx.addEventListener(window, "message", onIdentity);

    const observer = createMonkeytypeCaptureObserver({
      onStableResult: async (result) => {
        const merged: ParsedMonkeytypeResult = latestIdentity
          ? {
              ...result,
              monkeytypeResultId: latestIdentity.monkeytypeResultId,
              monkeytypeTimestamp: latestIdentity.monkeytypeTimestamp ?? result.monkeytypeTimestamp
            }
          : result;
        runState.set({ status: "capturing", result: merged });
        try {
          const post = await sendBackgroundMessage<RunCapturePostResult>({
            type: "RUN_CAPTURED",
            result: merged
          });
          runState.set({ status: post.status, post });
        } catch (error) {
          runState.set({
            status: "error",
            post: {
              status: "error",
              result,
              queueCount: 0,
              error: error instanceof Error ? error.message : "Run upload failed."
            }
          });
        }
      }
    });

    observer.start();
    ctx.addEventListener(window, "beforeunload", () => observer.stop());
  }
});
