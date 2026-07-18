import * as protobuf from "protobufjs/minimal.js";
import { Cause, Deferred, Effect, Fiber, Schema, Semaphore } from "effect";

import { forkApp, runApp } from "$lib/app/runtime";
import { PlatformError, platformError } from "$lib/effect/errors";
import {
  createZmkBehaviorCatalog,
  type ZmkBehaviorBinding,
  type ZmkBehaviorDetails,
  type ZmkBehaviorKind,
  type ZmkLockState,
  type ZmkParameterDescription,
  type ZmkPhysicalLayout,
  type ZmkSaveChangesStatus,
  type ZmkSetLayerBindingStatus,
  type ZmkStudioConnection,
  type ZmkStudioKeymap,
  type ZmkStudioRequest,
  type ZmkStudioResponse,
} from "./zmk-studio";

export enum LockState {
  ZMK_STUDIO_CORE_LOCK_STATE_LOCKED = 0,
  ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED = 1,
  UNRECOGNIZED = -1,
}

export enum ErrorConditions {
  GENERIC = 0,
  UNLOCK_REQUIRED = 1,
  RPC_NOT_FOUND = 2,
  MSG_DECODE_FAILED = 3,
  MSG_ENCODE_FAILED = 4,
  UNRECOGNIZED = -1,
}

export enum SaveChangesErrorCode {
  SAVE_CHANGES_ERR_OK = 0,
  SAVE_CHANGES_ERR_GENERIC = 1,
  SAVE_CHANGES_ERR_NOT_SUPPORTED = 2,
  SAVE_CHANGES_ERR_NO_SPACE = 3,
  UNRECOGNIZED = -1,
}

export enum SetLayerBindingResponse {
  SET_LAYER_BINDING_RESP_OK = 0,
  SET_LAYER_BINDING_RESP_INVALID_LOCATION = 1,
  SET_LAYER_BINDING_RESP_INVALID_BEHAVIOR = 2,
  SET_LAYER_BINDING_RESP_INVALID_PARAMETERS = 3,
  UNRECOGNIZED = -1,
}

export interface StudioRequestMessage {
  behaviors?: StudioBehaviorsRequestMessage;
  core?: StudioCoreRequestMessage;
  keymap?: StudioKeymapRequestMessage;
  requestId: number;
}

interface StudioCoreRequestMessage {
  getDeviceInfo?: boolean;
  getLockState?: boolean;
  resetSettings?: boolean;
}

interface StudioBehaviorsRequestMessage {
  getBehaviorDetails?: { behaviorId: number };
  listAllBehaviors?: boolean;
}

interface StudioKeymapRequestMessage {
  checkUnsavedChanges?: boolean;
  discardChanges?: boolean;
  getKeymap?: boolean;
  getPhysicalLayouts?: boolean;
  saveChanges?: boolean;
  setLayerBinding?: {
    binding?: StudioBehaviorBindingMessage;
    keyPosition: number;
    layerId: number;
  };
}

export interface StudioResponseMessage {
  notification?: StudioNotificationMessage;
  requestResponse?: StudioRequestResponseMessage;
}

export interface StudioRequestResponseMessage {
  behaviors?: StudioBehaviorsResponseMessage;
  core?: StudioCoreResponseMessage;
  keymap?: StudioKeymapResponseMessage;
  meta?: StudioMetaResponseMessage;
  requestId: number;
}

interface StudioCoreResponseMessage {
  getDeviceInfo?: { name: string; serialNumber: Uint8Array };
  getLockState?: LockState;
  resetSettings?: boolean;
}

interface StudioMetaResponseMessage {
  noResponse?: boolean;
  simpleError?: ErrorConditions;
}

interface StudioBehaviorsResponseMessage {
  getBehaviorDetails?: StudioGetBehaviorDetailsResponse;
  listAllBehaviors?: { behaviors: number[] };
}

interface StudioKeymapResponseMessage {
  checkUnsavedChanges?: boolean;
  discardChanges?: boolean;
  getKeymap?: StudioKeymapMessage;
  getPhysicalLayouts?: StudioPhysicalLayoutsMessage;
  saveChanges?: StudioSaveChangesResponse;
  setLayerBinding?: SetLayerBindingResponse;
}

export interface StudioNotificationMessage {
  core?: { lockStateChanged?: LockState };
  keymap?: { unsavedChangesStatusChanged?: boolean };
}

interface StudioSaveChangesResponse {
  err?: SaveChangesErrorCode;
  ok?: boolean;
}

interface StudioGetBehaviorDetailsResponse {
  displayName: string;
  id: number;
  metadata: StudioBehaviorBindingParametersSet[];
}

interface StudioBehaviorBindingParametersSet {
  param1: StudioBehaviorParameterValueDescription[];
  param2: StudioBehaviorParameterValueDescription[];
}

interface StudioBehaviorParameterValueDescription {
  constant?: number;
  hidUsage?: { consumerMax: number; keyboardMax: number };
  layerId?: Record<string, never>;
  name: string;
  nil?: Record<string, never>;
  range?: { max: number; min: number };
}

interface StudioKeymapMessage {
  availableLayers: number;
  layers: StudioLayerMessage[];
  maxLayerNameLength: number;
}

interface StudioLayerMessage {
  bindings: StudioBehaviorBindingMessage[];
  id: number;
  name: string;
}

interface StudioBehaviorBindingMessage {
  behaviorId: number;
  param1: number;
  param2: number;
}

interface StudioPhysicalLayoutsMessage {
  activeLayoutIndex: number;
  layouts: StudioPhysicalLayoutMessage[];
}

interface StudioPhysicalLayoutMessage {
  keys: StudioKeyPhysicalAttrsMessage[];
  name: string;
}

interface StudioKeyPhysicalAttrsMessage {
  height: number;
  r: number;
  rx: number;
  ry: number;
  width: number;
  x: number;
  y: number;
}

type Reader = protobuf.Reader;
type Writer = protobuf.Writer;

function writer(): Writer {
  return protobuf.Writer.create();
}

function reader(input: Reader | Uint8Array): Reader {
  return input instanceof protobuf.Reader ? input : protobuf.Reader.create(input);
}

function skipUnknown(nextReader: Reader, tag: number) {
  if ((tag & 7) === 4 || tag === 0) return false;
  nextReader.skipType(tag & 7);
  return true;
}

function encodeCoreRequest(message: StudioCoreRequestMessage, nextWriter: Writer) {
  if (message.getDeviceInfo !== undefined) nextWriter.uint32(8).bool(message.getDeviceInfo);
  if (message.getLockState !== undefined) nextWriter.uint32(16).bool(message.getLockState);
  if (message.resetSettings !== undefined) nextWriter.uint32(32).bool(message.resetSettings);
  return nextWriter;
}

function decodeCoreRequest(input: Reader | Uint8Array, length?: number): StudioCoreRequestMessage {
  const nextReader = reader(input);
  const end = length === undefined ? nextReader.len : nextReader.pos + length;
  const message: StudioCoreRequestMessage = {};
  while (nextReader.pos < end) {
    const tag = nextReader.uint32();
    if (tag === 8) message.getDeviceInfo = nextReader.bool();
    else if (tag === 16) message.getLockState = nextReader.bool();
    else if (tag === 32) message.resetSettings = nextReader.bool();
    else if (!skipUnknown(nextReader, tag)) break;
  }
  return message;
}

function encodeGetDeviceInfo(
  message: { name: string; serialNumber: Uint8Array },
  nextWriter: Writer,
) {
  if (message.name) nextWriter.uint32(10).string(message.name);
  if (message.serialNumber.length) nextWriter.uint32(18).bytes(message.serialNumber);
  return nextWriter;
}

function decodeGetDeviceInfo(input: Reader | Uint8Array, length?: number) {
  const nextReader = reader(input);
  const end = length === undefined ? nextReader.len : nextReader.pos + length;
  const message = { name: "", serialNumber: new Uint8Array(0) };
  while (nextReader.pos < end) {
    const tag = nextReader.uint32();
    if (tag === 10) message.name = nextReader.string();
    else if (tag === 18) message.serialNumber = new Uint8Array(nextReader.bytes());
    else if (!skipUnknown(nextReader, tag)) break;
  }
  return message;
}

function encodeCoreResponse(message: StudioCoreResponseMessage, nextWriter: Writer) {
  if (message.getDeviceInfo !== undefined) {
    encodeGetDeviceInfo(message.getDeviceInfo, nextWriter.uint32(10).fork()).ldelim();
  }
  if (message.getLockState !== undefined) nextWriter.uint32(16).int32(message.getLockState);
  if (message.resetSettings !== undefined) nextWriter.uint32(32).bool(message.resetSettings);
  return nextWriter;
}

function decodeCoreResponse(
  input: Reader | Uint8Array,
  length?: number,
): StudioCoreResponseMessage {
  const nextReader = reader(input);
  const end = length === undefined ? nextReader.len : nextReader.pos + length;
  const message: StudioCoreResponseMessage = {};
  while (nextReader.pos < end) {
    const tag = nextReader.uint32();
    if (tag === 10) message.getDeviceInfo = decodeGetDeviceInfo(nextReader, nextReader.uint32());
    else if (tag === 16) message.getLockState = nextReader.int32();
    else if (tag === 32) message.resetSettings = nextReader.bool();
    else if (!skipUnknown(nextReader, tag)) break;
  }
  return message;
}

function encodeCoreNotification(
  message: NonNullable<StudioNotificationMessage["core"]>,
  nextWriter: Writer,
) {
  if (message.lockStateChanged !== undefined) nextWriter.uint32(8).int32(message.lockStateChanged);
  return nextWriter;
}

function decodeCoreNotification(input: Reader | Uint8Array, length?: number) {
  const nextReader = reader(input);
  const end = length === undefined ? nextReader.len : nextReader.pos + length;
  const message: NonNullable<StudioNotificationMessage["core"]> = {};
  while (nextReader.pos < end) {
    const tag = nextReader.uint32();
    if (tag === 8) message.lockStateChanged = nextReader.int32();
    else if (!skipUnknown(nextReader, tag)) break;
  }
  return message;
}

function encodeMetaResponse(message: StudioMetaResponseMessage, nextWriter: Writer) {
  if (message.noResponse !== undefined) nextWriter.uint32(8).bool(message.noResponse);
  if (message.simpleError !== undefined) nextWriter.uint32(16).int32(message.simpleError);
  return nextWriter;
}

function decodeMetaResponse(
  input: Reader | Uint8Array,
  length?: number,
): StudioMetaResponseMessage {
  const nextReader = reader(input);
  const end = length === undefined ? nextReader.len : nextReader.pos + length;
  const message: StudioMetaResponseMessage = {};
  while (nextReader.pos < end) {
    const tag = nextReader.uint32();
    if (tag === 8) message.noResponse = nextReader.bool();
    else if (tag === 16) message.simpleError = nextReader.int32();
    else if (!skipUnknown(nextReader, tag)) break;
  }
  return message;
}

function encodeBehaviorsRequest(message: StudioBehaviorsRequestMessage, nextWriter: Writer) {
  if (message.listAllBehaviors !== undefined) nextWriter.uint32(8).bool(message.listAllBehaviors);
  if (message.getBehaviorDetails !== undefined) {
    nextWriter.uint32(18).fork().uint32(8).uint32(message.getBehaviorDetails.behaviorId).ldelim();
  }
  return nextWriter;
}

function decodeBehaviorsRequest(
  input: Reader | Uint8Array,
  length?: number,
): StudioBehaviorsRequestMessage {
  const nextReader = reader(input);
  const end = length === undefined ? nextReader.len : nextReader.pos + length;
  const message: StudioBehaviorsRequestMessage = {};
  while (nextReader.pos < end) {
    const tag = nextReader.uint32();
    if (tag === 8) message.listAllBehaviors = nextReader.bool();
    else if (tag === 18) {
      const nestedEnd = nextReader.uint32() + nextReader.pos;
      const details = { behaviorId: 0 };
      while (nextReader.pos < nestedEnd) {
        const nestedTag = nextReader.uint32();
        if (nestedTag === 8) details.behaviorId = nextReader.uint32();
        else if (!skipUnknown(nextReader, nestedTag)) break;
      }
      message.getBehaviorDetails = details;
    } else if (!skipUnknown(nextReader, tag)) break;
  }
  return message;
}

function encodeListAllBehaviorsResponse(message: { behaviors: number[] }, nextWriter: Writer) {
  nextWriter.uint32(10).fork();
  for (const behavior of message.behaviors) nextWriter.uint32(behavior);
  nextWriter.ldelim();
  return nextWriter;
}

function decodeListAllBehaviorsResponse(input: Reader | Uint8Array, length?: number) {
  const nextReader = reader(input);
  const end = length === undefined ? nextReader.len : nextReader.pos + length;
  const message = { behaviors: [] as number[] };
  while (nextReader.pos < end) {
    const tag = nextReader.uint32();
    if (tag === 8) message.behaviors.push(nextReader.uint32());
    else if (tag === 10) {
      const packedEnd = nextReader.uint32() + nextReader.pos;
      while (nextReader.pos < packedEnd) message.behaviors.push(nextReader.uint32());
    } else if (!skipUnknown(nextReader, tag)) break;
  }
  return message;
}

function encodeBehaviorParameterRange(message: { max: number; min: number }, nextWriter: Writer) {
  if (message.min !== 0) nextWriter.uint32(8).int32(message.min);
  if (message.max !== 0) nextWriter.uint32(16).int32(message.max);
  return nextWriter;
}

function decodeBehaviorParameterRange(input: Reader | Uint8Array, length?: number) {
  const nextReader = reader(input);
  const end = length === undefined ? nextReader.len : nextReader.pos + length;
  const message = { max: 0, min: 0 };
  while (nextReader.pos < end) {
    const tag = nextReader.uint32();
    if (tag === 8) message.min = nextReader.int32();
    else if (tag === 16) message.max = nextReader.int32();
    else if (!skipUnknown(nextReader, tag)) break;
  }
  return message;
}

function encodeHidUsage(message: { consumerMax: number; keyboardMax: number }, nextWriter: Writer) {
  if (message.keyboardMax !== 0) nextWriter.uint32(8).uint32(message.keyboardMax);
  if (message.consumerMax !== 0) nextWriter.uint32(16).uint32(message.consumerMax);
  return nextWriter;
}

function decodeHidUsage(input: Reader | Uint8Array, length?: number) {
  const nextReader = reader(input);
  const end = length === undefined ? nextReader.len : nextReader.pos + length;
  const message = { consumerMax: 0, keyboardMax: 0 };
  while (nextReader.pos < end) {
    const tag = nextReader.uint32();
    if (tag === 8) message.keyboardMax = nextReader.uint32();
    else if (tag === 16) message.consumerMax = nextReader.uint32();
    else if (!skipUnknown(nextReader, tag)) break;
  }
  return message;
}

function encodeBehaviorParameter(
  message: StudioBehaviorParameterValueDescription,
  nextWriter: Writer,
) {
  if (message.name) nextWriter.uint32(10).string(message.name);
  if (message.nil !== undefined) nextWriter.uint32(18).fork().ldelim();
  if (message.constant !== undefined) nextWriter.uint32(24).uint32(message.constant);
  if (message.range !== undefined) {
    encodeBehaviorParameterRange(message.range, nextWriter.uint32(34).fork()).ldelim();
  }
  if (message.hidUsage !== undefined) {
    encodeHidUsage(message.hidUsage, nextWriter.uint32(42).fork()).ldelim();
  }
  if (message.layerId !== undefined) nextWriter.uint32(50).fork().ldelim();
  return nextWriter;
}

function decodeBehaviorParameter(
  input: Reader | Uint8Array,
  length?: number,
): StudioBehaviorParameterValueDescription {
  const nextReader = reader(input);
  const end = length === undefined ? nextReader.len : nextReader.pos + length;
  const message: StudioBehaviorParameterValueDescription = { name: "" };
  while (nextReader.pos < end) {
    const tag = nextReader.uint32();
    if (tag === 10) message.name = nextReader.string();
    else if (tag === 18) {
      nextReader.skipType(2);
      message.nil = {};
    } else if (tag === 24) message.constant = nextReader.uint32();
    else if (tag === 34)
      message.range = decodeBehaviorParameterRange(nextReader, nextReader.uint32());
    else if (tag === 42) message.hidUsage = decodeHidUsage(nextReader, nextReader.uint32());
    else if (tag === 50) {
      nextReader.skipType(2);
      message.layerId = {};
    } else if (!skipUnknown(nextReader, tag)) break;
  }
  return message;
}

function encodeBehaviorParameterSet(
  message: StudioBehaviorBindingParametersSet,
  nextWriter: Writer,
) {
  for (const param of message.param1)
    encodeBehaviorParameter(param, nextWriter.uint32(10).fork()).ldelim();
  for (const param of message.param2)
    encodeBehaviorParameter(param, nextWriter.uint32(18).fork()).ldelim();
  return nextWriter;
}

function decodeBehaviorParameterSet(
  input: Reader | Uint8Array,
  length?: number,
): StudioBehaviorBindingParametersSet {
  const nextReader = reader(input);
  const end = length === undefined ? nextReader.len : nextReader.pos + length;
  const message: StudioBehaviorBindingParametersSet = { param1: [], param2: [] };
  while (nextReader.pos < end) {
    const tag = nextReader.uint32();
    if (tag === 10) message.param1.push(decodeBehaviorParameter(nextReader, nextReader.uint32()));
    else if (tag === 18)
      message.param2.push(decodeBehaviorParameter(nextReader, nextReader.uint32()));
    else if (!skipUnknown(nextReader, tag)) break;
  }
  return message;
}

function encodeBehaviorDetails(message: StudioGetBehaviorDetailsResponse, nextWriter: Writer) {
  if (message.id !== 0) nextWriter.uint32(8).uint32(message.id);
  if (message.displayName) nextWriter.uint32(18).string(message.displayName);
  for (const metadata of message.metadata) {
    encodeBehaviorParameterSet(metadata, nextWriter.uint32(26).fork()).ldelim();
  }
  return nextWriter;
}

function decodeBehaviorDetails(
  input: Reader | Uint8Array,
  length?: number,
): StudioGetBehaviorDetailsResponse {
  const nextReader = reader(input);
  const end = length === undefined ? nextReader.len : nextReader.pos + length;
  const message: StudioGetBehaviorDetailsResponse = { displayName: "", id: 0, metadata: [] };
  while (nextReader.pos < end) {
    const tag = nextReader.uint32();
    if (tag === 8) message.id = nextReader.uint32();
    else if (tag === 18) message.displayName = nextReader.string();
    else if (tag === 26)
      message.metadata.push(decodeBehaviorParameterSet(nextReader, nextReader.uint32()));
    else if (!skipUnknown(nextReader, tag)) break;
  }
  return message;
}

function encodeBehaviorsResponse(message: StudioBehaviorsResponseMessage, nextWriter: Writer) {
  if (message.listAllBehaviors !== undefined) {
    encodeListAllBehaviorsResponse(message.listAllBehaviors, nextWriter.uint32(10).fork()).ldelim();
  }
  if (message.getBehaviorDetails !== undefined) {
    encodeBehaviorDetails(message.getBehaviorDetails, nextWriter.uint32(18).fork()).ldelim();
  }
  return nextWriter;
}

function decodeBehaviorsResponse(
  input: Reader | Uint8Array,
  length?: number,
): StudioBehaviorsResponseMessage {
  const nextReader = reader(input);
  const end = length === undefined ? nextReader.len : nextReader.pos + length;
  const message: StudioBehaviorsResponseMessage = {};
  while (nextReader.pos < end) {
    const tag = nextReader.uint32();
    if (tag === 10)
      message.listAllBehaviors = decodeListAllBehaviorsResponse(nextReader, nextReader.uint32());
    else if (tag === 18)
      message.getBehaviorDetails = decodeBehaviorDetails(nextReader, nextReader.uint32());
    else if (!skipUnknown(nextReader, tag)) break;
  }
  return message;
}

function encodeBehaviorBinding(message: StudioBehaviorBindingMessage, nextWriter: Writer) {
  if (message.behaviorId !== 0) nextWriter.uint32(8).sint32(message.behaviorId);
  if (message.param1 !== 0) nextWriter.uint32(16).uint32(message.param1);
  if (message.param2 !== 0) nextWriter.uint32(24).uint32(message.param2);
  return nextWriter;
}

function decodeBehaviorBinding(
  input: Reader | Uint8Array,
  length?: number,
): StudioBehaviorBindingMessage {
  const nextReader = reader(input);
  const end = length === undefined ? nextReader.len : nextReader.pos + length;
  const message: StudioBehaviorBindingMessage = { behaviorId: 0, param1: 0, param2: 0 };
  while (nextReader.pos < end) {
    const tag = nextReader.uint32();
    if (tag === 8) message.behaviorId = nextReader.sint32();
    else if (tag === 16) message.param1 = nextReader.uint32();
    else if (tag === 24) message.param2 = nextReader.uint32();
    else if (!skipUnknown(nextReader, tag)) break;
  }
  return message;
}

function encodeSetLayerBindingRequest(
  message: NonNullable<StudioKeymapRequestMessage["setLayerBinding"]>,
  nextWriter: Writer,
) {
  if (message.layerId !== 0) nextWriter.uint32(8).uint32(message.layerId);
  if (message.keyPosition !== 0) nextWriter.uint32(16).int32(message.keyPosition);
  if (message.binding !== undefined) {
    encodeBehaviorBinding(message.binding, nextWriter.uint32(26).fork()).ldelim();
  }
  return nextWriter;
}

function decodeSetLayerBindingRequest(input: Reader | Uint8Array, length?: number) {
  const nextReader = reader(input);
  const end = length === undefined ? nextReader.len : nextReader.pos + length;
  const message: NonNullable<StudioKeymapRequestMessage["setLayerBinding"]> = {
    keyPosition: 0,
    layerId: 0,
  };
  while (nextReader.pos < end) {
    const tag = nextReader.uint32();
    if (tag === 8) message.layerId = nextReader.uint32();
    else if (tag === 16) message.keyPosition = nextReader.int32();
    else if (tag === 26) message.binding = decodeBehaviorBinding(nextReader, nextReader.uint32());
    else if (!skipUnknown(nextReader, tag)) break;
  }
  return message;
}

function encodeKeymapRequest(message: StudioKeymapRequestMessage, nextWriter: Writer) {
  if (message.getKeymap !== undefined) nextWriter.uint32(8).bool(message.getKeymap);
  if (message.setLayerBinding !== undefined) {
    encodeSetLayerBindingRequest(message.setLayerBinding, nextWriter.uint32(18).fork()).ldelim();
  }
  if (message.checkUnsavedChanges !== undefined) {
    nextWriter.uint32(24).bool(message.checkUnsavedChanges);
  }
  if (message.saveChanges !== undefined) nextWriter.uint32(32).bool(message.saveChanges);
  if (message.discardChanges !== undefined) nextWriter.uint32(40).bool(message.discardChanges);
  if (message.getPhysicalLayouts !== undefined) {
    nextWriter.uint32(48).bool(message.getPhysicalLayouts);
  }
  return nextWriter;
}

function decodeKeymapRequest(
  input: Reader | Uint8Array,
  length?: number,
): StudioKeymapRequestMessage {
  const nextReader = reader(input);
  const end = length === undefined ? nextReader.len : nextReader.pos + length;
  const message: StudioKeymapRequestMessage = {};
  while (nextReader.pos < end) {
    const tag = nextReader.uint32();
    if (tag === 8) message.getKeymap = nextReader.bool();
    else if (tag === 18)
      message.setLayerBinding = decodeSetLayerBindingRequest(nextReader, nextReader.uint32());
    else if (tag === 24) message.checkUnsavedChanges = nextReader.bool();
    else if (tag === 32) message.saveChanges = nextReader.bool();
    else if (tag === 40) message.discardChanges = nextReader.bool();
    else if (tag === 48) message.getPhysicalLayouts = nextReader.bool();
    else if (!skipUnknown(nextReader, tag)) break;
  }
  return message;
}

function encodeSaveChangesResponse(message: StudioSaveChangesResponse, nextWriter: Writer) {
  if (message.ok !== undefined) nextWriter.uint32(8).bool(message.ok);
  if (message.err !== undefined) nextWriter.uint32(16).int32(message.err);
  return nextWriter;
}

function decodeSaveChangesResponse(
  input: Reader | Uint8Array,
  length?: number,
): StudioSaveChangesResponse {
  const nextReader = reader(input);
  const end = length === undefined ? nextReader.len : nextReader.pos + length;
  const message: StudioSaveChangesResponse = {};
  while (nextReader.pos < end) {
    const tag = nextReader.uint32();
    if (tag === 8) message.ok = nextReader.bool();
    else if (tag === 16) message.err = nextReader.int32();
    else if (!skipUnknown(nextReader, tag)) break;
  }
  return message;
}

function encodeLayer(message: StudioLayerMessage, nextWriter: Writer) {
  if (message.id !== 0) nextWriter.uint32(8).uint32(message.id);
  if (message.name) nextWriter.uint32(18).string(message.name);
  for (const binding of message.bindings) {
    encodeBehaviorBinding(binding, nextWriter.uint32(26).fork()).ldelim();
  }
  return nextWriter;
}

function decodeLayer(input: Reader | Uint8Array, length?: number): StudioLayerMessage {
  const nextReader = reader(input);
  const end = length === undefined ? nextReader.len : nextReader.pos + length;
  const message: StudioLayerMessage = { bindings: [], id: 0, name: "" };
  while (nextReader.pos < end) {
    const tag = nextReader.uint32();
    if (tag === 8) message.id = nextReader.uint32();
    else if (tag === 18) message.name = nextReader.string();
    else if (tag === 26)
      message.bindings.push(decodeBehaviorBinding(nextReader, nextReader.uint32()));
    else if (!skipUnknown(nextReader, tag)) break;
  }
  return message;
}

function encodeKeymap(message: StudioKeymapMessage, nextWriter: Writer) {
  for (const layer of message.layers) encodeLayer(layer, nextWriter.uint32(10).fork()).ldelim();
  if (message.availableLayers !== 0) nextWriter.uint32(16).uint32(message.availableLayers);
  if (message.maxLayerNameLength !== 0) nextWriter.uint32(24).uint32(message.maxLayerNameLength);
  return nextWriter;
}

function decodeKeymap(input: Reader | Uint8Array, length?: number): StudioKeymapMessage {
  const nextReader = reader(input);
  const end = length === undefined ? nextReader.len : nextReader.pos + length;
  const message: StudioKeymapMessage = { availableLayers: 0, layers: [], maxLayerNameLength: 0 };
  while (nextReader.pos < end) {
    const tag = nextReader.uint32();
    if (tag === 10) message.layers.push(decodeLayer(nextReader, nextReader.uint32()));
    else if (tag === 16) message.availableLayers = nextReader.uint32();
    else if (tag === 24) message.maxLayerNameLength = nextReader.uint32();
    else if (!skipUnknown(nextReader, tag)) break;
  }
  return message;
}

function encodeKeyPhysicalAttrs(message: StudioKeyPhysicalAttrsMessage, nextWriter: Writer) {
  if (message.width !== 0) nextWriter.uint32(8).sint32(message.width);
  if (message.height !== 0) nextWriter.uint32(16).sint32(message.height);
  if (message.x !== 0) nextWriter.uint32(24).sint32(message.x);
  if (message.y !== 0) nextWriter.uint32(32).sint32(message.y);
  if (message.r !== 0) nextWriter.uint32(40).sint32(message.r);
  if (message.rx !== 0) nextWriter.uint32(48).sint32(message.rx);
  if (message.ry !== 0) nextWriter.uint32(56).sint32(message.ry);
  return nextWriter;
}

function decodeKeyPhysicalAttrs(
  input: Reader | Uint8Array,
  length?: number,
): StudioKeyPhysicalAttrsMessage {
  const nextReader = reader(input);
  const end = length === undefined ? nextReader.len : nextReader.pos + length;
  const message: StudioKeyPhysicalAttrsMessage = {
    height: 0,
    r: 0,
    rx: 0,
    ry: 0,
    width: 0,
    x: 0,
    y: 0,
  };
  while (nextReader.pos < end) {
    const tag = nextReader.uint32();
    if (tag === 8) message.width = nextReader.sint32();
    else if (tag === 16) message.height = nextReader.sint32();
    else if (tag === 24) message.x = nextReader.sint32();
    else if (tag === 32) message.y = nextReader.sint32();
    else if (tag === 40) message.r = nextReader.sint32();
    else if (tag === 48) message.rx = nextReader.sint32();
    else if (tag === 56) message.ry = nextReader.sint32();
    else if (!skipUnknown(nextReader, tag)) break;
  }
  return message;
}

function encodePhysicalLayout(message: StudioPhysicalLayoutMessage, nextWriter: Writer) {
  if (message.name) nextWriter.uint32(10).string(message.name);
  for (const key of message.keys)
    encodeKeyPhysicalAttrs(key, nextWriter.uint32(18).fork()).ldelim();
  return nextWriter;
}

function decodePhysicalLayout(
  input: Reader | Uint8Array,
  length?: number,
): StudioPhysicalLayoutMessage {
  const nextReader = reader(input);
  const end = length === undefined ? nextReader.len : nextReader.pos + length;
  const message: StudioPhysicalLayoutMessage = { keys: [], name: "" };
  while (nextReader.pos < end) {
    const tag = nextReader.uint32();
    if (tag === 10) message.name = nextReader.string();
    else if (tag === 18) message.keys.push(decodeKeyPhysicalAttrs(nextReader, nextReader.uint32()));
    else if (!skipUnknown(nextReader, tag)) break;
  }
  return message;
}

function encodePhysicalLayouts(message: StudioPhysicalLayoutsMessage, nextWriter: Writer) {
  if (message.activeLayoutIndex !== 0) nextWriter.uint32(8).uint32(message.activeLayoutIndex);
  for (const layout of message.layouts) {
    encodePhysicalLayout(layout, nextWriter.uint32(18).fork()).ldelim();
  }
  return nextWriter;
}

function decodePhysicalLayouts(
  input: Reader | Uint8Array,
  length?: number,
): StudioPhysicalLayoutsMessage {
  const nextReader = reader(input);
  const end = length === undefined ? nextReader.len : nextReader.pos + length;
  const message: StudioPhysicalLayoutsMessage = { activeLayoutIndex: 0, layouts: [] };
  while (nextReader.pos < end) {
    const tag = nextReader.uint32();
    if (tag === 8) message.activeLayoutIndex = nextReader.uint32();
    else if (tag === 18)
      message.layouts.push(decodePhysicalLayout(nextReader, nextReader.uint32()));
    else if (!skipUnknown(nextReader, tag)) break;
  }
  return message;
}

function encodeKeymapResponse(message: StudioKeymapResponseMessage, nextWriter: Writer) {
  if (message.getKeymap !== undefined)
    encodeKeymap(message.getKeymap, nextWriter.uint32(10).fork()).ldelim();
  if (message.setLayerBinding !== undefined) nextWriter.uint32(16).int32(message.setLayerBinding);
  if (message.checkUnsavedChanges !== undefined)
    nextWriter.uint32(24).bool(message.checkUnsavedChanges);
  if (message.saveChanges !== undefined)
    encodeSaveChangesResponse(message.saveChanges, nextWriter.uint32(34).fork()).ldelim();
  if (message.discardChanges !== undefined) nextWriter.uint32(40).bool(message.discardChanges);
  if (message.getPhysicalLayouts !== undefined) {
    encodePhysicalLayouts(message.getPhysicalLayouts, nextWriter.uint32(50).fork()).ldelim();
  }
  return nextWriter;
}

function decodeKeymapResponse(
  input: Reader | Uint8Array,
  length?: number,
): StudioKeymapResponseMessage {
  const nextReader = reader(input);
  const end = length === undefined ? nextReader.len : nextReader.pos + length;
  const message: StudioKeymapResponseMessage = {};
  while (nextReader.pos < end) {
    const tag = nextReader.uint32();
    if (tag === 10) message.getKeymap = decodeKeymap(nextReader, nextReader.uint32());
    else if (tag === 16) message.setLayerBinding = nextReader.int32();
    else if (tag === 24) message.checkUnsavedChanges = nextReader.bool();
    else if (tag === 34)
      message.saveChanges = decodeSaveChangesResponse(nextReader, nextReader.uint32());
    else if (tag === 40) message.discardChanges = nextReader.bool();
    else if (tag === 50)
      message.getPhysicalLayouts = decodePhysicalLayouts(nextReader, nextReader.uint32());
    else if (!skipUnknown(nextReader, tag)) break;
  }
  return message;
}

function encodeKeymapNotification(
  message: NonNullable<StudioNotificationMessage["keymap"]>,
  nextWriter: Writer,
) {
  if (message.unsavedChangesStatusChanged !== undefined) {
    nextWriter.uint32(8).bool(message.unsavedChangesStatusChanged);
  }
  return nextWriter;
}

function decodeKeymapNotification(input: Reader | Uint8Array, length?: number) {
  const nextReader = reader(input);
  const end = length === undefined ? nextReader.len : nextReader.pos + length;
  const message: NonNullable<StudioNotificationMessage["keymap"]> = {};
  while (nextReader.pos < end) {
    const tag = nextReader.uint32();
    if (tag === 8) message.unsavedChangesStatusChanged = nextReader.bool();
    else if (!skipUnknown(nextReader, tag)) break;
  }
  return message;
}

function encodeRequestResponse(message: StudioRequestResponseMessage, nextWriter: Writer) {
  if (message.requestId !== 0) nextWriter.uint32(8).uint32(message.requestId);
  if (message.meta !== undefined)
    encodeMetaResponse(message.meta, nextWriter.uint32(18).fork()).ldelim();
  if (message.core !== undefined)
    encodeCoreResponse(message.core, nextWriter.uint32(26).fork()).ldelim();
  if (message.behaviors !== undefined) {
    encodeBehaviorsResponse(message.behaviors, nextWriter.uint32(34).fork()).ldelim();
  }
  if (message.keymap !== undefined)
    encodeKeymapResponse(message.keymap, nextWriter.uint32(42).fork()).ldelim();
  return nextWriter;
}

function decodeRequestResponse(
  input: Reader | Uint8Array,
  length?: number,
): StudioRequestResponseMessage {
  const nextReader = reader(input);
  const end = length === undefined ? nextReader.len : nextReader.pos + length;
  const message: StudioRequestResponseMessage = { requestId: 0 };
  while (nextReader.pos < end) {
    const tag = nextReader.uint32();
    if (tag === 8) message.requestId = nextReader.uint32();
    else if (tag === 18) message.meta = decodeMetaResponse(nextReader, nextReader.uint32());
    else if (tag === 26) message.core = decodeCoreResponse(nextReader, nextReader.uint32());
    else if (tag === 34)
      message.behaviors = decodeBehaviorsResponse(nextReader, nextReader.uint32());
    else if (tag === 42) message.keymap = decodeKeymapResponse(nextReader, nextReader.uint32());
    else if (!skipUnknown(nextReader, tag)) break;
  }
  return message;
}

function encodeNotification(message: StudioNotificationMessage, nextWriter: Writer) {
  if (message.core !== undefined)
    encodeCoreNotification(message.core, nextWriter.uint32(18).fork()).ldelim();
  if (message.keymap !== undefined) {
    encodeKeymapNotification(message.keymap, nextWriter.uint32(42).fork()).ldelim();
  }
  return nextWriter;
}

function decodeNotification(
  input: Reader | Uint8Array,
  length?: number,
): StudioNotificationMessage {
  const nextReader = reader(input);
  const end = length === undefined ? nextReader.len : nextReader.pos + length;
  const message: StudioNotificationMessage = {};
  while (nextReader.pos < end) {
    const tag = nextReader.uint32();
    if (tag === 18) message.core = decodeCoreNotification(nextReader, nextReader.uint32());
    else if (tag === 42) message.keymap = decodeKeymapNotification(nextReader, nextReader.uint32());
    else if (!skipUnknown(nextReader, tag)) break;
  }
  return message;
}

const StudioRequestCodec = {
  decode(input: Reader | Uint8Array, length?: number): StudioRequestMessage {
    const nextReader = reader(input);
    const end = length === undefined ? nextReader.len : nextReader.pos + length;
    const message: StudioRequestMessage = { requestId: 0 };
    while (nextReader.pos < end) {
      const tag = nextReader.uint32();
      if (tag === 8) message.requestId = nextReader.uint32();
      else if (tag === 26) message.core = decodeCoreRequest(nextReader, nextReader.uint32());
      else if (tag === 34)
        message.behaviors = decodeBehaviorsRequest(nextReader, nextReader.uint32());
      else if (tag === 42) message.keymap = decodeKeymapRequest(nextReader, nextReader.uint32());
      else if (!skipUnknown(nextReader, tag)) break;
    }
    return message;
  },
  encode(message: StudioRequestMessage, nextWriter: Writer = writer()) {
    if (message.requestId !== 0) nextWriter.uint32(8).uint32(message.requestId);
    if (message.core !== undefined)
      encodeCoreRequest(message.core, nextWriter.uint32(26).fork()).ldelim();
    if (message.behaviors !== undefined) {
      encodeBehaviorsRequest(message.behaviors, nextWriter.uint32(34).fork()).ldelim();
    }
    if (message.keymap !== undefined)
      encodeKeymapRequest(message.keymap, nextWriter.uint32(42).fork()).ldelim();
    return nextWriter;
  },
};

const StudioResponseCodec = {
  decode(input: Reader | Uint8Array, length?: number): StudioResponseMessage {
    const nextReader = reader(input);
    const end = length === undefined ? nextReader.len : nextReader.pos + length;
    const message: StudioResponseMessage = {};
    while (nextReader.pos < end) {
      const tag = nextReader.uint32();
      if (tag === 10)
        message.requestResponse = decodeRequestResponse(nextReader, nextReader.uint32());
      else if (tag === 18)
        message.notification = decodeNotification(nextReader, nextReader.uint32());
      else if (!skipUnknown(nextReader, tag)) break;
    }
    return message;
  },
  encode(message: StudioResponseMessage, nextWriter: Writer = writer()) {
    if (message.requestResponse !== undefined) {
      encodeRequestResponse(message.requestResponse, nextWriter.uint32(10).fork()).ldelim();
    }
    if (message.notification !== undefined) {
      encodeNotification(message.notification, nextWriter.uint32(18).fork()).ldelim();
    }
    return nextWriter;
  },
};

export const zmkStudioFrameBytes = {
  eof: 0xad,
  esc: 0xac,
  sof: 0xab,
} as const;

export interface ZmkStudioByteTransport {
  abortController?: AbortController;
  close?: () => Promise<void>;
  label: string;
  readable: ReadableStream<Uint8Array>;
  writable: WritableStream<Uint8Array>;
}

export type ZmkStudioNotification =
  | { type: "lock_state_changed"; lockState: ZmkLockState }
  | { type: "unsaved_changes_status_changed"; hasUnsavedChanges: boolean };

export interface ZmkStudioRpcClientOptions {
  onNotification?: (notification: ZmkStudioNotification) => void;
  timeoutMs?: number;
}

interface PendingRpc {
  deferred: Deferred.Deferred<ZmkStudioResponse, ZmkStudioRpcError>;
  request: ZmkStudioRequest;
}

enum DeframeState {
  Idle,
  AwaitingData,
  Escaped,
}

const defaultRpcTimeoutMs = 5_000;

function isSpecialFrameByte(byte: number) {
  return (
    byte === zmkStudioFrameBytes.sof ||
    byte === zmkStudioFrameBytes.esc ||
    byte === zmkStudioFrameBytes.eof
  );
}

export function frameZmkStudioPayload(payload: Uint8Array): Uint8Array {
  const frame: number[] = [zmkStudioFrameBytes.sof];
  for (const byte of payload) {
    if (isSpecialFrameByte(byte)) frame.push(zmkStudioFrameBytes.esc);
    frame.push(byte);
  }
  frame.push(zmkStudioFrameBytes.eof);
  return new Uint8Array(frame);
}

export class ZmkStudioDeframer {
  private data: number[] = [];
  private state = DeframeState.Idle;

  push(chunk: Uint8Array): Uint8Array[] {
    const frames: Uint8Array[] = [];

    for (const byte of chunk) {
      if (this.state === DeframeState.Idle) {
        if (byte !== zmkStudioFrameBytes.sof) {
          throw new Error("Expected ZMK Studio frame to start with SoF.");
        }
        this.state = DeframeState.AwaitingData;
        continue;
      }

      if (this.state === DeframeState.Escaped) {
        this.data.push(byte);
        this.state = DeframeState.AwaitingData;
        continue;
      }

      if (byte === zmkStudioFrameBytes.sof) {
        throw new Error("Unexpected ZMK Studio SoF inside a frame.");
      }
      if (byte === zmkStudioFrameBytes.esc) {
        this.state = DeframeState.Escaped;
        continue;
      }
      if (byte === zmkStudioFrameBytes.eof) {
        frames.push(new Uint8Array(this.data));
        this.data = [];
        this.state = DeframeState.Idle;
        continue;
      }

      this.data.push(byte);
    }

    return frames;
  }
}

export function deframeZmkStudioPayload(frame: Uint8Array): Uint8Array[] {
  return new ZmkStudioDeframer().push(frame);
}

export function encodeZmkStudioRequestMessage(request: StudioRequestMessage): Uint8Array {
  return StudioRequestCodec.encode(request).finish();
}

export function decodeZmkStudioRequestMessage(bytes: Uint8Array): StudioRequestMessage {
  return StudioRequestCodec.decode(bytes);
}

export function encodeZmkStudioResponseMessage(response: StudioResponseMessage): Uint8Array {
  return StudioResponseCodec.encode(response).finish();
}

export function decodeZmkStudioResponseMessage(bytes: Uint8Array): StudioResponseMessage {
  return StudioResponseCodec.decode(bytes);
}

export class ZmkStudioRpcNoResponseError extends Schema.TaggedErrorClass<ZmkStudioRpcNoResponseError>()(
  "ZmkStudioRpcNoResponseError",
  {},
) {
  override get message() {
    return "ZMK Studio RPC returned no response.";
  }
}

export class ZmkStudioRpcMetaError extends Schema.TaggedErrorClass<ZmkStudioRpcMetaError>()(
  "ZmkStudioRpcMetaError",
  { condition: Schema.Enum(ErrorConditions) },
) {
  override get message() {
    return `ZMK Studio RPC meta error: ${metaErrorName(this.condition)}.`;
  }
}

export class ZmkStudioRpcClosedError extends Schema.TaggedErrorClass<ZmkStudioRpcClosedError>()(
  "ZmkStudioRpcClosedError",
  { message: Schema.String },
) {}

export class ZmkStudioRpcTimeoutError extends Schema.TaggedErrorClass<ZmkStudioRpcTimeoutError>()(
  "ZmkStudioRpcTimeoutError",
  { requestId: Schema.Int },
) {
  override get message() {
    return `ZMK Studio RPC request ${this.requestId} timed out.`;
  }
}

export class ZmkStudioRpcTransportClosedError extends Schema.TaggedErrorClass<ZmkStudioRpcTransportClosedError>()(
  "ZmkStudioRpcTransportClosedError",
  {},
) {
  override get message() {
    return "ZMK Studio RPC transport closed unexpectedly.";
  }
}

export class ZmkStudioRpcDecodeError extends Schema.TaggedErrorClass<ZmkStudioRpcDecodeError>()(
  "ZmkStudioRpcDecodeError",
  {
    operation: Schema.String,
    message: Schema.String,
    cause: Schema.Defect(),
  },
) {}

export type ZmkStudioRpcError =
  | PlatformError
  | ZmkStudioRpcClosedError
  | ZmkStudioRpcDecodeError
  | ZmkStudioRpcMetaError
  | ZmkStudioRpcNoResponseError
  | ZmkStudioRpcTimeoutError
  | ZmkStudioRpcTransportClosedError;

function zmkStudioRpcDecodeError(operation: string, cause: unknown) {
  return new ZmkStudioRpcDecodeError({
    operation,
    message: cause instanceof Error ? cause.message : String(cause),
    cause,
  });
}

function metaErrorName(condition: ErrorConditions) {
  return ErrorConditions[condition] ?? String(condition);
}

function zmkLockStateFromProto(lockState: LockState): ZmkLockState {
  return lockState === LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED ? "unlocked" : "locked";
}

function zmkLockStateToProto(lockState: ZmkLockState): LockState {
  return lockState === "unlocked"
    ? LockState.ZMK_STUDIO_CORE_LOCK_STATE_UNLOCKED
    : LockState.ZMK_STUDIO_CORE_LOCK_STATE_LOCKED;
}

function serialNumberFromBytes(bytes: Uint8Array | undefined) {
  if (!bytes || bytes.length === 0) return "unknown";

  let decoded = new TextDecoder().decode(bytes);
  while (decoded.endsWith("\u0000")) decoded = decoded.slice(0, -1);
  decoded = decoded.trim();
  if (decoded && /^[\x20-\x7e]+$/.test(decoded)) return decoded;

  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function serialNumberToBytes(serialNumber: string) {
  return new TextEncoder().encode(serialNumber);
}

export function zmkStudioProtoRequestFor(
  request: ZmkStudioRequest,
): Omit<StudioRequestMessage, "requestId"> {
  if (request.type === "get_device_info") return { core: { getDeviceInfo: true } };
  if (request.type === "get_lock_state") return { core: { getLockState: true } };
  if (request.type === "list_all_behaviors") return { behaviors: { listAllBehaviors: true } };
  if (request.type === "get_behavior_details") {
    return { behaviors: { getBehaviorDetails: { behaviorId: request.behaviorId } } };
  }
  if (request.type === "get_physical_layouts") return { keymap: { getPhysicalLayouts: true } };
  if (request.type === "get_keymap") return { keymap: { getKeymap: true } };
  if (request.type === "set_layer_binding") {
    return {
      keymap: {
        setLayerBinding: {
          binding: studioBindingFromZmkBinding(request.binding),
          keyPosition: request.keyPosition,
          layerId: request.layerId,
        },
      },
    };
  }
  if (request.type === "check_unsaved_changes") {
    return { keymap: { checkUnsavedChanges: true } };
  }
  if (request.type === "save_changes") return { keymap: { saveChanges: true } };
  if (request.type === "discard_changes") return { keymap: { discardChanges: true } };
  return { core: { resetSettings: true } };
}

export function zmkStudioRequestFromProto(request: StudioRequestMessage): ZmkStudioRequest {
  if (request.core?.getDeviceInfo) return { type: "get_device_info" };
  if (request.core?.getLockState) return { type: "get_lock_state" };
  if (request.core?.resetSettings) return { type: "reset_settings" };
  if (request.behaviors?.listAllBehaviors) return { type: "list_all_behaviors" };
  if (request.behaviors?.getBehaviorDetails) {
    return {
      behaviorId: request.behaviors.getBehaviorDetails.behaviorId,
      type: "get_behavior_details",
    };
  }
  if (request.keymap?.getPhysicalLayouts) return { type: "get_physical_layouts" };
  if (request.keymap?.getKeymap) return { type: "get_keymap" };
  if (request.keymap?.setLayerBinding) {
    const binding = request.keymap.setLayerBinding.binding;
    if (!binding) throw new Error("ZMK set_layer_binding request is missing a binding.");
    return {
      binding: zmkBindingFromStudioBinding(binding),
      keyPosition: request.keymap.setLayerBinding.keyPosition,
      layerId: request.keymap.setLayerBinding.layerId,
      type: "set_layer_binding",
    };
  }
  if (request.keymap?.checkUnsavedChanges) return { type: "check_unsaved_changes" };
  if (request.keymap?.saveChanges) return { type: "save_changes" };
  if (request.keymap?.discardChanges) return { type: "discard_changes" };

  throw new Error("Unsupported ZMK Studio request protobuf.");
}

function studioBindingFromZmkBinding(binding: ZmkBehaviorBinding): StudioBehaviorBindingMessage {
  return {
    behaviorId: binding.behaviorId,
    param1: binding.param1,
    param2: binding.param2,
  };
}

function zmkBindingFromStudioBinding(binding: StudioBehaviorBindingMessage): ZmkBehaviorBinding {
  return {
    behaviorId: binding.behaviorId,
    param1: binding.param1,
    param2: binding.param2,
  };
}

function zmkKeymapFromProto(keymap: StudioKeymapMessage): ZmkStudioKeymap {
  return {
    availableLayers: keymap.availableLayers,
    layers: keymap.layers.map((layer) => ({
      bindings: layer.bindings.map(zmkBindingFromStudioBinding),
      id: layer.id,
      name: layer.name,
    })),
  };
}

function studioKeymapFromZmkKeymap(keymap: ZmkStudioKeymap): StudioKeymapMessage {
  return {
    availableLayers: keymap.availableLayers,
    maxLayerNameLength: 32,
    layers: keymap.layers.map((layer) => ({
      bindings: layer.bindings.map(studioBindingFromZmkBinding),
      id: layer.id,
      name: layer.name,
    })),
  };
}

function roundedLayoutCoord(value: number) {
  return Math.round(value * 100) / 100;
}

function inferLayoutGrid(keys: readonly StudioPhysicalLayoutMessage["keys"][number][]) {
  const rowValues = Array.from(new Set(keys.map((key) => roundedLayoutCoord(key.y)))).sort(
    (left, right) => left - right,
  );
  const rows = keys.map((key) => {
    const rounded = roundedLayoutCoord(key.y);
    const row = rowValues.indexOf(rounded);
    return row < 0 ? 0 : row;
  });

  const cols = keys.map(() => 0);
  for (const row of rowValues.keys()) {
    const indices = keys
      .map((key, index) => ({ index, key }))
      .filter(({ index }) => rows[index] === row)
      .sort((left, right) => left.key.x - right.key.x || left.index - right.index);

    indices.forEach(({ index }, col) => {
      cols[index] = col;
    });
  }

  return { cols, rows };
}

function zmkPhysicalLayoutFromProto(
  layout: StudioPhysicalLayoutMessage,
  layoutIndex: number,
): ZmkPhysicalLayout {
  const grid = inferLayoutGrid(layout.keys);

  return {
    id: layoutIndex + 1,
    keys: layout.keys.map((key, keyPosition) => ({
      col: grid.cols[keyPosition] ?? keyPosition,
      height: key.height || 1,
      id: `zmk-key-${keyPosition}`,
      keyPosition,
      label: String(keyPosition + 1),
      rotation: key.r || undefined,
      row: grid.rows[keyPosition] ?? 0,
      width: key.width || 1,
      x: key.x,
      y: key.y,
    })),
    name: layout.name || `Layout ${layoutIndex + 1}`,
  };
}

function zmkPhysicalLayoutsFromProto(
  physicalLayouts: StudioPhysicalLayoutsMessage,
): Extract<ZmkStudioResponse, { type: "get_physical_layouts" }> {
  return {
    activeLayoutIndex: physicalLayouts.activeLayoutIndex,
    layouts: physicalLayouts.layouts.map(zmkPhysicalLayoutFromProto),
    type: "get_physical_layouts",
  };
}

function studioPhysicalLayoutsFromZmkPhysicalLayouts(
  response: Extract<ZmkStudioResponse, { type: "get_physical_layouts" }>,
): StudioPhysicalLayoutsMessage {
  return {
    activeLayoutIndex: response.activeLayoutIndex,
    layouts: response.layouts.map((layout) => ({
      keys: layout.keys.map((key) => ({
        height: key.height ?? 1,
        r: key.rotation ?? 0,
        rx: 0,
        ry: 0,
        width: key.width ?? 1,
        x: key.x ?? key.col,
        y: key.y ?? key.row,
      })),
      name: layout.name,
    })),
  };
}

function parameterDescriptionFromProto(
  description: StudioBehaviorParameterValueDescription,
): ZmkParameterDescription {
  const parameter: ZmkParameterDescription = { name: description.name || "parameter" };

  if (description.nil !== undefined) {
    parameter.values = [0];
  } else if (description.constant !== undefined) {
    parameter.values = [description.constant];
  } else if (description.range) {
    parameter.min = description.range.min;
    parameter.max = description.range.max;
  } else if (description.hidUsage) {
    parameter.min = 0;
    parameter.max = Math.max(description.hidUsage.keyboardMax, description.hidUsage.consumerMax);
  }

  return parameter;
}

function parameterSetFromProto(
  parameterSet: StudioBehaviorBindingParametersSet,
): ZmkBehaviorDetails["parameterSets"][number] {
  return {
    param1: parameterSet.param1.map(parameterDescriptionFromProto),
    param2: parameterSet.param2.map(parameterDescriptionFromProto),
  };
}

function inferBehaviorKind(details: StudioGetBehaviorDetailsResponse): ZmkBehaviorKind {
  const label = details.displayName.toLowerCase();
  const parameters = details.metadata.flatMap((set) => [...set.param1, ...set.param2]);
  const hasHidUsage = parameters.some((parameter) => parameter.hidUsage !== undefined);
  const hasLayerId = parameters.some((parameter) => parameter.layerId !== undefined);

  if (label.includes("studio") && label.includes("unlock")) return "studioUnlock";
  if (label.includes("transparent") || label.includes("&trans")) return "transparent";
  if (label.includes("no operation") || label.includes("none") || label.includes("&none")) {
    return "none";
  }
  if (hasHidUsage || label.includes("key press") || label.includes("&kp")) return "keyPress";

  if (hasLayerId) {
    if (label.includes("toggle") || label.includes("&tog") || label.includes("&tg")) {
      return "toggleLayer";
    }
    if (label.includes("momentary") || label.includes("&mo")) return "momentaryLayer";
    if (/\bto\b/.test(label) || label.includes("&to")) return "toLayer";
  }

  return "unknown";
}

function behaviorCodeForKind(kind: ZmkBehaviorKind, displayName: string, id: number) {
  if (displayName.trim().startsWith("&")) return displayName.trim();
  if (kind === "keyPress") return "&kp";
  if (kind === "transparent") return "&trans";
  if (kind === "none") return "&none";
  if (kind === "momentaryLayer") return "&mo";
  if (kind === "toLayer") return "&to";
  if (kind === "toggleLayer") return "&tog";
  if (kind === "studioUnlock") return "&studio_unlock";
  return displayName || `behavior:${id}`;
}

function zmkBehaviorDetailsFromProto(
  details: StudioGetBehaviorDetailsResponse,
): ZmkBehaviorDetails {
  const kind = inferBehaviorKind(details);

  return {
    code: behaviorCodeForKind(kind, details.displayName, details.id),
    displayName: details.displayName || `Behavior ${details.id}`,
    id: details.id,
    kind,
    parameterSets: details.metadata.map(parameterSetFromProto),
  };
}

function behaviorParameterToProto(
  description: ZmkParameterDescription,
  kind: ZmkBehaviorKind,
): StudioBehaviorParameterValueDescription {
  if (description.values?.length === 1) {
    return { constant: description.values[0], name: description.name };
  }
  if (description.min !== undefined || description.max !== undefined) {
    return {
      name: description.name,
      range: {
        max: description.max ?? 0x7fffffff,
        min: description.min ?? -0x7fffffff,
      },
    };
  }
  if (kind === "momentaryLayer" || kind === "toLayer" || kind === "toggleLayer") {
    return { layerId: {}, name: description.name || "layer" };
  }
  return { name: description.name, nil: {} };
}

function behaviorDetailsToProto(behavior: ZmkBehaviorDetails): StudioGetBehaviorDetailsResponse {
  return {
    displayName: behavior.displayName,
    id: behavior.id,
    metadata: behavior.parameterSets.map((set) => ({
      param1: set.param1.map((description) => behaviorParameterToProto(description, behavior.kind)),
      param2: set.param2.map((description) => behaviorParameterToProto(description, behavior.kind)),
    })),
  };
}

function setLayerBindingStatusFromProto(
  response: SetLayerBindingResponse,
): ZmkSetLayerBindingStatus {
  if (response === SetLayerBindingResponse.SET_LAYER_BINDING_RESP_OK) return "ok";
  if (response === SetLayerBindingResponse.SET_LAYER_BINDING_RESP_INVALID_LOCATION) {
    return "invalid-location";
  }
  if (response === SetLayerBindingResponse.SET_LAYER_BINDING_RESP_INVALID_BEHAVIOR) {
    return "invalid-behavior";
  }
  if (response === SetLayerBindingResponse.SET_LAYER_BINDING_RESP_INVALID_PARAMETERS) {
    return "invalid-parameters";
  }
  return "error";
}

function setLayerBindingStatusToProto(status: ZmkSetLayerBindingStatus) {
  if (status === "ok") return SetLayerBindingResponse.SET_LAYER_BINDING_RESP_OK;
  if (status === "invalid-location") {
    return SetLayerBindingResponse.SET_LAYER_BINDING_RESP_INVALID_LOCATION;
  }
  if (status === "invalid-behavior") {
    return SetLayerBindingResponse.SET_LAYER_BINDING_RESP_INVALID_BEHAVIOR;
  }
  if (status === "invalid-parameters") {
    return SetLayerBindingResponse.SET_LAYER_BINDING_RESP_INVALID_PARAMETERS;
  }
  return SetLayerBindingResponse.UNRECOGNIZED;
}

function saveChangesStatusFromProto(
  response: StudioSaveChangesResponse | undefined,
): ZmkSaveChangesStatus {
  if (!response) return "error";
  if (response.ok || response.err === SaveChangesErrorCode.SAVE_CHANGES_ERR_OK) return "ok";
  if (response.err === SaveChangesErrorCode.SAVE_CHANGES_ERR_NO_SPACE) return "no-space";
  return "error";
}

function saveChangesStatusToProto(status: ZmkSaveChangesStatus) {
  if (status === "ok") return { ok: true };
  return {
    err:
      status === "no-space"
        ? SaveChangesErrorCode.SAVE_CHANGES_ERR_NO_SPACE
        : SaveChangesErrorCode.SAVE_CHANGES_ERR_GENERIC,
  };
}

export function zmkStudioResponseFromProtoRequestResponse(
  request: ZmkStudioRequest,
  response: StudioRequestResponseMessage,
): ZmkStudioResponse {
  if (request.type === "get_device_info") {
    const info = response.core?.getDeviceInfo;
    if (!info) throw new Error("ZMK device info response mismatch.");
    return {
      deviceName: info.name || "ZMK Studio keyboard",
      firmwareVersion: "ZMK Studio",
      manufacturer: "ZMK",
      serialNumber: serialNumberFromBytes(info.serialNumber),
      type: "get_device_info",
    };
  }

  if (request.type === "get_lock_state") {
    if (response.core?.getLockState === undefined) {
      throw new Error("ZMK lock state response mismatch.");
    }
    return {
      lockState: zmkLockStateFromProto(response.core.getLockState),
      type: "get_lock_state",
    };
  }

  if (request.type === "list_all_behaviors") {
    const list = response.behaviors?.listAllBehaviors;
    if (!list) throw new Error("ZMK behavior list response mismatch.");
    return { behaviorIds: [...list.behaviors], type: "list_all_behaviors" };
  }

  if (request.type === "get_behavior_details") {
    const details = response.behaviors?.getBehaviorDetails;
    if (!details) throw new Error("ZMK behavior details response mismatch.");
    return { behavior: zmkBehaviorDetailsFromProto(details), type: "get_behavior_details" };
  }

  if (request.type === "get_physical_layouts") {
    const layouts = response.keymap?.getPhysicalLayouts;
    if (!layouts) throw new Error("ZMK physical layouts response mismatch.");
    return zmkPhysicalLayoutsFromProto(layouts);
  }

  if (request.type === "get_keymap") {
    const keymap = response.keymap?.getKeymap;
    if (!keymap) throw new Error("ZMK keymap response mismatch.");
    return { keymap: zmkKeymapFromProto(keymap), type: "get_keymap" };
  }

  if (request.type === "set_layer_binding") {
    if (response.keymap?.setLayerBinding === undefined) {
      throw new Error("ZMK set_layer_binding response mismatch.");
    }
    return {
      status: setLayerBindingStatusFromProto(response.keymap.setLayerBinding),
      type: "set_layer_binding",
    };
  }

  if (request.type === "check_unsaved_changes") {
    if (response.keymap?.checkUnsavedChanges === undefined) {
      throw new Error("ZMK unsaved-change response mismatch.");
    }
    return {
      hasUnsavedChanges: response.keymap.checkUnsavedChanges,
      type: "check_unsaved_changes",
    };
  }

  if (request.type === "save_changes") {
    return {
      status: saveChangesStatusFromProto(response.keymap?.saveChanges),
      type: "save_changes",
    };
  }

  if (request.type === "discard_changes") {
    if (response.keymap?.discardChanges === undefined) {
      throw new Error("ZMK discard_changes response mismatch.");
    }
    return {
      status: response.keymap.discardChanges ? "ok" : "error",
      type: "discard_changes",
    };
  }

  if (response.core?.resetSettings === undefined) {
    throw new Error("ZMK reset_settings response mismatch.");
  }
  return {
    status: response.core.resetSettings ? "ok" : "error",
    type: "reset_settings",
  };
}

export function zmkStudioMetaErrorResponse(
  requestId: number,
  condition: ErrorConditions,
): StudioResponseMessage {
  return { requestResponse: { meta: { simpleError: condition }, requestId } };
}

export function zmkStudioNoResponse(requestId: number): StudioResponseMessage {
  return { requestResponse: { meta: { noResponse: true }, requestId } };
}

export function zmkStudioProtoResponseFor(
  requestId: number,
  response: ZmkStudioResponse,
): StudioResponseMessage {
  if (response.type === "set_layer_binding" && response.status === "locked") {
    return zmkStudioMetaErrorResponse(requestId, ErrorConditions.UNLOCK_REQUIRED);
  }

  const requestResponse: StudioRequestResponseMessage = { requestId };

  if (response.type === "get_device_info") {
    requestResponse.core = {
      getDeviceInfo: {
        name: response.deviceName,
        serialNumber: serialNumberToBytes(response.serialNumber),
      },
    };
  } else if (response.type === "get_lock_state") {
    requestResponse.core = { getLockState: zmkLockStateToProto(response.lockState) };
  } else if (response.type === "list_all_behaviors") {
    requestResponse.behaviors = { listAllBehaviors: { behaviors: [...response.behaviorIds] } };
  } else if (response.type === "get_behavior_details") {
    requestResponse.behaviors = { getBehaviorDetails: behaviorDetailsToProto(response.behavior) };
  } else if (response.type === "get_physical_layouts") {
    requestResponse.keymap = {
      getPhysicalLayouts: studioPhysicalLayoutsFromZmkPhysicalLayouts(response),
    };
  } else if (response.type === "get_keymap") {
    requestResponse.keymap = { getKeymap: studioKeymapFromZmkKeymap(response.keymap) };
  } else if (response.type === "set_layer_binding") {
    requestResponse.keymap = { setLayerBinding: setLayerBindingStatusToProto(response.status) };
  } else if (response.type === "check_unsaved_changes") {
    requestResponse.keymap = { checkUnsavedChanges: response.hasUnsavedChanges };
  } else if (response.type === "save_changes") {
    requestResponse.keymap = { saveChanges: saveChangesStatusToProto(response.status) };
  } else if (response.type === "discard_changes") {
    requestResponse.keymap = { discardChanges: response.status === "ok" };
  } else {
    requestResponse.core = { resetSettings: response.status === "ok" };
  }

  return { requestResponse };
}

function zmkNotificationFromProto(
  notification: StudioNotificationMessage,
): ZmkStudioNotification | undefined {
  if (notification.core?.lockStateChanged !== undefined) {
    return {
      lockState: zmkLockStateFromProto(notification.core.lockStateChanged),
      type: "lock_state_changed",
    };
  }
  if (notification.keymap?.unsavedChangesStatusChanged !== undefined) {
    return {
      hasUnsavedChanges: notification.keymap.unsavedChangesStatusChanged,
      type: "unsaved_changes_status_changed",
    };
  }
  return undefined;
}

export function zmkStudioProtoNotificationFor(
  notification: ZmkStudioNotification,
): StudioResponseMessage {
  if (notification.type === "lock_state_changed") {
    return {
      notification: {
        core: { lockStateChanged: zmkLockStateToProto(notification.lockState) },
      },
    };
  }
  return {
    notification: {
      keymap: { unsavedChangesStatusChanged: notification.hasUnsavedChanges },
    },
  };
}

function identitySlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function zmkStudioDeviceKey(input: {
  productName?: string;
  serialNumber?: string;
  transport: "webbluetooth" | "webserial";
}) {
  const serial = input.serialNumber?.trim();
  if (serial && serial !== "unknown") return `keyboard:zmk-studio:${input.transport}:${serial}`;

  return `keyboard:zmk-studio:${input.transport}:${identitySlug(input.productName ?? "keyboard")}`;
}

export class ZmkStudioRpcClient {
  private closed = false;
  private readonly deframer = new ZmkStudioDeframer();
  private nextRequestId = 1;
  private readonly onNotification: ((notification: ZmkStudioNotification) => void) | undefined;
  private readonly pending = new Map<number, PendingRpc>();
  private readonly reader: ReadableStreamDefaultReader<Uint8Array>;
  private readonly readFiber: Fiber.Fiber<void, ZmkStudioRpcError>;
  private readonly timeoutMs: number;
  private readonly transport: ZmkStudioByteTransport;
  private readonly writeSemaphore = Semaphore.makeUnsafe(1);
  private readonly writer: WritableStreamDefaultWriter<Uint8Array>;

  constructor(transport: ZmkStudioByteTransport, options: ZmkStudioRpcClientOptions = {}) {
    this.onNotification = options.onNotification;
    this.timeoutMs = options.timeoutMs ?? defaultRpcTimeoutMs;
    this.transport = transport;
    this.reader = transport.readable.getReader();
    this.writer = transport.writable.getWriter();
    this.readFiber = forkApp(
      "zmk-studio.rpc.read",
      this.readLoopEffect().pipe(Effect.tapError((error) => this.failPendingEffect(error))),
    );
  }

  call(request: ZmkStudioRequest): Promise<ZmkStudioResponse> {
    return runApp("zmk-studio.rpc.call", this.callEffect(request));
  }

  callEffect(request: ZmkStudioRequest): Effect.Effect<ZmkStudioResponse, ZmkStudioRpcError> {
    let requestId = 0;
    return Effect.gen({ self: this }, function* () {
      if (this.closed) {
        return yield* Effect.fail(
          new ZmkStudioRpcClosedError({ message: "ZMK Studio RPC connection is closed." }),
        );
      }

      requestId = this.nextRequestId;
      this.nextRequestId += 1;
      const protoRequest = {
        ...zmkStudioProtoRequestFor(request),
        requestId,
      };
      const frame = frameZmkStudioPayload(encodeZmkStudioRequestMessage(protoRequest));
      const deferred = yield* Deferred.make<ZmkStudioResponse, ZmkStudioRpcError>();
      yield* Effect.sync(() => this.pending.set(requestId, { deferred, request }));

      yield* this.writeSemaphore.withPermit(
        Effect.tryPromise({
          try: () => this.writer.write(frame),
          catch: (cause) => platformError("zmk-studio.write-frame", cause),
        }),
      );

      return yield* Deferred.await(deferred).pipe(
        Effect.timeout(this.timeoutMs),
        Effect.mapError((error) =>
          Cause.isTimeoutError(error) ? new ZmkStudioRpcTimeoutError({ requestId }) : error,
        ),
      );
    }).pipe(
      Effect.ensuring(
        Effect.sync(() => {
          if (requestId !== 0) this.pending.delete(requestId);
        }),
      ),
    );
  }

  close(): Promise<void> {
    return runApp(
      "zmk-studio.rpc.close",
      Effect.gen({ self: this }, function* () {
        if (this.closed) return;
        this.closed = true;
        yield* this.failPendingEffect(
          new ZmkStudioRpcClosedError({ message: "ZMK Studio RPC connection closed." }),
        );

        const cleanups: ReadonlyArray<Effect.Effect<unknown, Error>> = [
          Fiber.interrupt(this.readFiber),
          Effect.tryPromise({
            try: () => this.reader.cancel(),
            catch: (cause) => platformError("zmk-studio.cancel-reader", cause),
          }),
          Effect.tryPromise({
            try: () => this.writer.close(),
            catch: (cause) => platformError("zmk-studio.close-writer", cause),
          }),
          ...(this.transport.close
            ? [
                Effect.tryPromise({
                  try: () => this.transport.close!(),
                  catch: (cause) => platformError("zmk-studio.close-transport", cause),
                }),
              ]
            : []),
        ];
        const results = yield* Effect.forEach(cleanups, (cleanup) => cleanup.pipe(Effect.result), {
          concurrency: "unbounded",
        });
        yield* Effect.sync(() => {
          this.writer.releaseLock();
          this.transport.abortController?.abort();
        });
        const failures = results.filter((result) => result._tag === "Failure");
        if (failures.length > 0) {
          return yield* Effect.fail(
            platformError(
              "zmk-studio.close",
              failures.map((result) => result.failure.message).join("; "),
            ),
          );
        }
      }),
    );
  }

  private failPendingEffect(error: ZmkStudioRpcError): Effect.Effect<void> {
    const pending = [...this.pending.values()];
    this.pending.clear();
    return Effect.forEach(pending, ({ deferred }) => Deferred.fail(deferred, error), {
      discard: true,
    });
  }

  private handleRequestResponseEffect(
    response: StudioRequestResponseMessage,
  ): Effect.Effect<void, ZmkStudioRpcError> {
    const pending = this.pending.get(response.requestId);
    if (!pending) return Effect.void;

    if (response.meta?.noResponse) {
      this.pending.delete(response.requestId);
      return Deferred.fail(pending.deferred, new ZmkStudioRpcNoResponseError({})).pipe(
        Effect.map(() => undefined),
      );
    }
    if (response.meta?.simpleError !== undefined) {
      this.pending.delete(response.requestId);
      return Deferred.fail(
        pending.deferred,
        new ZmkStudioRpcMetaError({ condition: response.meta.simpleError }),
      ).pipe(Effect.map(() => undefined));
    }

    return Effect.try({
      try: () => zmkStudioResponseFromProtoRequestResponse(pending.request, response),
      catch: (cause) => zmkStudioRpcDecodeError("zmk-studio.decode-response", cause),
    }).pipe(
      Effect.tap(() => Effect.sync(() => this.pending.delete(response.requestId))),
      Effect.flatMap((decoded) => Deferred.succeed(pending.deferred, decoded)),
      Effect.map(() => undefined),
    );
  }

  private handleResponseEffect(
    response: StudioResponseMessage,
  ): Effect.Effect<void, ZmkStudioRpcError> {
    if (response.requestResponse) {
      return this.handleRequestResponseEffect(response.requestResponse);
    }

    if (response.notification) {
      const notification = zmkNotificationFromProto(response.notification);
      if (notification && this.onNotification) {
        return Effect.try({
          try: () => this.onNotification!(notification),
          catch: (cause) => platformError("zmk-studio.notification", cause),
        });
      }
    }
    return Effect.void;
  }

  private readLoopEffect(): Effect.Effect<void, ZmkStudioRpcError> {
    return Effect.suspend(() =>
      Effect.gen({ self: this }, function* () {
        const { done, value } = yield* Effect.tryPromise({
          try: () => this.reader.read(),
          catch: (cause) => platformError("zmk-studio.read-frame", cause),
        });
        if (done) {
          if (this.closed) return;
          return yield* Effect.fail(new ZmkStudioRpcTransportClosedError({}));
        }
        if (value) {
          const responses = yield* Effect.try({
            try: () =>
              this.deframer.push(value).map((payload) => decodeZmkStudioResponseMessage(payload)),
            catch: (cause) => zmkStudioRpcDecodeError("zmk-studio.decode-frame", cause),
          });
          yield* Effect.forEach(responses, (response) => this.handleResponseEffect(response), {
            discard: true,
          });
        }
        return yield* this.readLoopEffect();
      }),
    );
  }
}

export class RealZmkStudioConnection implements ZmkStudioConnection {
  readonly mode = "real";

  behaviorCatalog = createZmkBehaviorCatalog([]);
  keyPositionByKeyId: Record<string, number> = {};
  keymap: ZmkStudioKeymap | undefined;
  label: string;
  layerIdByLayerIndex: number[] = [];
  lockState: ZmkLockState = "locked";

  private readonly rpc: ZmkStudioRpcClient;

  constructor(transport: ZmkStudioByteTransport, options: ZmkStudioRpcClientOptions = {}) {
    this.label = transport.label;
    this.rpc = new ZmkStudioRpcClient(transport, {
      ...options,
      onNotification: (notification) => {
        if (notification.type === "lock_state_changed") this.lockState = notification.lockState;
        options.onNotification?.(notification);
      },
    });
  }

  call(request: ZmkStudioRequest): Promise<ZmkStudioResponse> {
    return runApp(
      "zmk-studio.connection.call",
      this.rpc.callEffect(request).pipe(
        Effect.tap((response) =>
          Effect.sync(() => {
            if (response.type === "get_lock_state") this.lockState = response.lockState;
            if (response.type === "get_keymap") {
              this.keymap = response.keymap;
              this.layerIdByLayerIndex = response.keymap.layers.map((layer) => layer.id);
            }
          }),
        ),
      ),
    );
  }

  close() {
    return this.rpc.close();
  }
}
