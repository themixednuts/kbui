import { Effect } from "effect";
import { describe, expect, it } from "vite-plus/test";

import { behaviorDetails } from "./zmk-binding";
import {
  ZmkStudioDeframer,
  ErrorConditions,
  ZmkStudioRpcClient,
  ZmkStudioRpcClosedError,
  ZmkStudioRpcDecodeError,
  ZmkStudioRpcMetaError,
  ZmkStudioRpcNoResponseError,
  ZmkStudioRpcTimeoutError,
  decodeZmkStudioRequestMessage,
  decodeZmkStudioResponseMessage,
  deframeZmkStudioPayload,
  encodeZmkStudioRequestMessage,
  encodeZmkStudioResponseMessage,
  frameZmkStudioPayload,
  zmkStudioFrameBytes,
  zmkStudioMetaErrorResponse,
  zmkStudioNoResponse,
  zmkStudioProtoNotificationFor,
  zmkStudioProtoRequestFor,
  zmkStudioProtoResponseFor,
  zmkStudioRequestFromProto,
  zmkStudioResponseFromProtoRequestResponse,
  type ZmkStudioByteTransport,
  type ZmkStudioNotification,
} from "./zmk-studio-rpc";
import { MockZmkStudioConnection } from "./transport-mock-zmk";
import type { ZmkStudioRequest, ZmkStudioResponse } from "./zmk-studio";

type RequestHandler = (
  request: ReturnType<typeof decodeZmkStudioRequestMessage>,
  respond: (response: ReturnType<typeof zmkStudioProtoResponseFor>) => void,
) => void;

function tick() {
  return new Promise((resolve) => globalThis.setTimeout(resolve, 0));
}

function createScriptedTransport(handler: RequestHandler): ZmkStudioByteTransport {
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const deframer = new ZmkStudioDeframer();

  const readable = new ReadableStream<Uint8Array>({
    start(nextController) {
      controller = nextController;
    },
  });

  const writable = new WritableStream<Uint8Array>({
    write(chunk) {
      for (const payload of deframer.push(chunk)) {
        const request = decodeZmkStudioRequestMessage(payload);
        handler(request, (response) => {
          controller?.enqueue(frameZmkStudioPayload(encodeZmkStudioResponseMessage(response)));
        });
      }
    },
  });

  return { label: "scripted-zmk-rpc", readable, writable };
}

function roundTripRequest(request: ZmkStudioRequest) {
  const proto = { ...zmkStudioProtoRequestFor(request), requestId: 7 };
  const decoded = decodeZmkStudioRequestMessage(encodeZmkStudioRequestMessage(proto));
  return zmkStudioRequestFromProto(decoded);
}

function roundTripResponse(request: ZmkStudioRequest, response: ZmkStudioResponse) {
  const proto = zmkStudioProtoResponseFor(7, response);
  const decoded = decodeZmkStudioResponseMessage(encodeZmkStudioResponseMessage(proto));
  if (!decoded.requestResponse) throw new Error("Missing request response.");
  return zmkStudioResponseFromProtoRequestResponse(request, decoded.requestResponse);
}

describe("ZMK Studio framed protobuf RPC", () => {
  it("frames, escapes, deframes, and decodes protobuf payloads", () => {
    const specialPayload = new Uint8Array([
      0,
      zmkStudioFrameBytes.sof,
      zmkStudioFrameBytes.esc,
      zmkStudioFrameBytes.eof,
      1,
    ]);

    expect(Array.from(frameZmkStudioPayload(specialPayload))).toEqual([
      zmkStudioFrameBytes.sof,
      0,
      zmkStudioFrameBytes.esc,
      zmkStudioFrameBytes.sof,
      zmkStudioFrameBytes.esc,
      zmkStudioFrameBytes.esc,
      zmkStudioFrameBytes.esc,
      zmkStudioFrameBytes.eof,
      1,
      zmkStudioFrameBytes.eof,
    ]);
    expect(Array.from(deframeZmkStudioPayload(frameZmkStudioPayload(specialPayload))[0])).toEqual(
      Array.from(specialPayload),
    );

    const request = {
      ...zmkStudioProtoRequestFor({
        binding: { behaviorId: 1, param1: 0xab, param2: 0xad },
        keyPosition: 3,
        layerId: 100,
        type: "set_layer_binding",
      }),
      requestId: 12,
    };
    const framed = frameZmkStudioPayload(encodeZmkStudioRequestMessage(request));
    const [payload] = deframeZmkStudioPayload(framed);
    const decoded = decodeZmkStudioRequestMessage(payload);

    expect(decoded.requestId).toBe(12);
    expect(decoded.keymap?.setLayerBinding?.binding?.param1).toBe(0xab);
    expect(decoded.keymap?.setLayerBinding?.binding?.param2).toBe(0xad);
  });

  it("encodes and decodes each needed local request and response", () => {
    const behavior = behaviorDetails(1, "&kp", "Key press", "keyPress", [
      {
        param1: [{ max: 0xffff, min: 0, name: "usage" }],
        param2: [{ name: "unused", values: [0] }],
      },
    ]);
    const keymap = {
      availableLayers: 1,
      layers: [
        {
          bindings: [{ behaviorId: 1, param1: 4, param2: 0 }],
          id: 100,
          name: "Base",
        },
      ],
    };
    const layouts = {
      activeLayoutIndex: 0,
      layouts: [
        {
          id: 1,
          keys: [
            {
              col: 0,
              id: "k0",
              keyPosition: 0,
              label: "A",
              row: 0,
              width: 1,
              x: 0,
              y: 0,
            },
          ],
          name: "Default",
        },
      ],
      type: "get_physical_layouts" as const,
    };

    const cases: Array<[ZmkStudioRequest, ZmkStudioResponse]> = [
      [
        { type: "get_device_info" },
        {
          deviceName: "Test ZMK",
          firmwareVersion: "ZMK Studio",
          manufacturer: "ZMK",
          serialNumber: "SERIAL",
          type: "get_device_info",
        },
      ],
      [{ type: "get_lock_state" }, { lockState: "unlocked", type: "get_lock_state" }],
      [{ type: "list_all_behaviors" }, { behaviorIds: [1, 2, 3], type: "list_all_behaviors" }],
      [
        { behaviorId: 1, type: "get_behavior_details" },
        { behavior, type: "get_behavior_details" },
      ],
      [{ type: "get_physical_layouts" }, layouts],
      [{ type: "get_keymap" }, { keymap, type: "get_keymap" }],
      [
        {
          binding: { behaviorId: 1, param1: 5, param2: 0 },
          keyPosition: 0,
          layerId: 100,
          type: "set_layer_binding",
        },
        { status: "ok", type: "set_layer_binding" },
      ],
      [
        { type: "check_unsaved_changes" },
        { hasUnsavedChanges: true, type: "check_unsaved_changes" },
      ],
      [{ type: "save_changes" }, { status: "no-space", type: "save_changes" }],
      [{ type: "discard_changes" }, { status: "ok", type: "discard_changes" }],
      [{ type: "reset_settings" }, { status: "ok", type: "reset_settings" }],
    ];

    for (const [request, response] of cases) {
      expect(roundTripRequest(request)).toMatchObject(request);
      expect(roundTripResponse(request, response)).toMatchObject({
        type: response.type,
      });
    }

    expect(roundTripResponse({ type: "get_keymap" }, { keymap, type: "get_keymap" })).toEqual({
      keymap,
      type: "get_keymap",
    });
    expect(
      roundTripResponse(
        { behaviorId: 1, type: "get_behavior_details" },
        { behavior, type: "get_behavior_details" },
      ),
    ).toMatchObject({ behavior: { id: 1, kind: "keyPress" } });
  });

  it("multiplexes request ids and dispatches notifications", async () => {
    const notifications: ZmkStudioNotification[] = [];
    const transport = createScriptedTransport((request, respond) => {
      if (request.core?.getLockState) {
        globalThis.setTimeout(() => {
          respond(
            zmkStudioProtoResponseFor(request.requestId, {
              lockState: "locked",
              type: "get_lock_state",
            }),
          );
        }, 10);
        return;
      }

      respond(
        zmkStudioProtoResponseFor(request.requestId, {
          deviceName: "Out of Order",
          firmwareVersion: "ZMK Studio",
          manufacturer: "ZMK",
          serialNumber: "OOO",
          type: "get_device_info",
        }),
      );
      respond(zmkStudioProtoNotificationFor({ lockState: "unlocked", type: "lock_state_changed" }));
    });
    const client = new ZmkStudioRpcClient(transport, {
      onNotification: (notification) => notifications.push(notification),
      timeoutMs: 500,
    });

    const lockPromise = client.call({ type: "get_lock_state" });
    const infoPromise = client.call({ type: "get_device_info" });
    const [lock, info] = await Promise.all([lockPromise, infoPromise]);
    await tick();
    await client.close();

    expect(lock).toEqual({ lockState: "locked", type: "get_lock_state" });
    expect(info).toMatchObject({ deviceName: "Out of Order", type: "get_device_info" });
    expect(notifications).toContainEqual({ lockState: "unlocked", type: "lock_state_changed" });
  });

  it("surfaces tagged protobuf meta errors", async () => {
    const transport = createScriptedTransport((request, respond) => {
      respond(zmkStudioMetaErrorResponse(request.requestId, ErrorConditions.UNLOCK_REQUIRED));
    });
    const client = new ZmkStudioRpcClient(transport, { timeoutMs: 500 });

    const error = await Effect.runPromise(Effect.flip(client.callEffect({ type: "get_keymap" })));
    await client.close();

    expect(error).toBeInstanceOf(ZmkStudioRpcMetaError);
    expect(error).toMatchObject({
      _tag: "ZmkStudioRpcMetaError",
      condition: ErrorConditions.UNLOCK_REQUIRED,
    });
  });

  it("tags no-response, timeout, and closed-connection failures", async () => {
    const noResponseClient = new ZmkStudioRpcClient(
      createScriptedTransport((request, respond) =>
        respond(zmkStudioNoResponse(request.requestId)),
      ),
      { timeoutMs: 500 },
    );
    const noResponseError = await Effect.runPromise(
      Effect.flip(noResponseClient.callEffect({ type: "get_device_info" })),
    );
    await noResponseClient.close();

    const timeoutClient = new ZmkStudioRpcClient(
      createScriptedTransport(() => undefined),
      {
        timeoutMs: 10,
      },
    );
    const timeoutError = await Effect.runPromise(
      Effect.flip(timeoutClient.callEffect({ type: "get_lock_state" })),
    );
    await timeoutClient.close();

    const closedClient = new ZmkStudioRpcClient(createScriptedTransport(() => undefined));
    await closedClient.close();
    const closedError = await Effect.runPromise(
      Effect.flip(closedClient.callEffect({ type: "get_keymap" })),
    );

    expect(noResponseError).toBeInstanceOf(ZmkStudioRpcNoResponseError);
    expect(noResponseError._tag).toBe("ZmkStudioRpcNoResponseError");
    expect(timeoutError).toBeInstanceOf(ZmkStudioRpcTimeoutError);
    expect(timeoutError).toMatchObject({ _tag: "ZmkStudioRpcTimeoutError", requestId: 1 });
    expect(closedError).toBeInstanceOf(ZmkStudioRpcClosedError);
    expect(closedError._tag).toBe("ZmkStudioRpcClosedError");
  });

  it("tags mismatched RPC responses as decode failures", async () => {
    const client = new ZmkStudioRpcClient(
      createScriptedTransport((request, respond) => {
        respond({ requestResponse: { requestId: request.requestId } });
      }),
      { timeoutMs: 500 },
    );

    const error = await Effect.runPromise(
      Effect.flip(client.callEffect({ type: "get_device_info" })),
    );
    await client.close();

    expect(error).toBeInstanceOf(ZmkStudioRpcDecodeError);
    expect(error).toMatchObject({
      _tag: "ZmkStudioRpcDecodeError",
      operation: "zmk-studio.decode-response",
    });
  });

  it("drives the existing mock ZMK handlers through the framed protobuf pipeline", async () => {
    const mock = new MockZmkStudioConnection();
    const transport = createScriptedTransport((request, respond) => {
      void mock.call(zmkStudioRequestFromProto(request)).then((response) => {
        respond(zmkStudioProtoResponseFor(request.requestId, response));
      });
    });
    const client = new ZmkStudioRpcClient(transport, { timeoutMs: 500 });

    const set = await client.call({
      binding: { behaviorId: 1, param1: 5, param2: 0 },
      keyPosition: 0,
      layerId: 100,
      type: "set_layer_binding",
    });
    const readback = await client.call({ type: "get_keymap" });
    const save = await client.call({ type: "save_changes" });
    await client.close();

    expect(set).toEqual({ status: "ok", type: "set_layer_binding" });
    expect(readback.type).toBe("get_keymap");
    expect(readback.type === "get_keymap" && readback.keymap.layers[0].bindings[0]).toEqual({
      behaviorId: 1,
      param1: 5,
      param2: 0,
    });
    expect(save).toEqual({ status: "ok", type: "save_changes" });
    expect(mock.sentRequests.map((request) => request.type)).toEqual([
      "set_layer_binding",
      "get_keymap",
      "save_changes",
    ]);
  });
});
