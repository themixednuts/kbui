import { Schema } from "effect";

const shortText = Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(160));
const optionalShortText = Schema.optionalKey(shortText);
const boundedId = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(160),
  Schema.isPattern(/^[A-Za-z0-9._:@+-]+$/),
);
const communityId = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(80),
  Schema.isPattern(/^[A-Za-z0-9:_-]+$/),
);
const usbId = Schema.Int.check(Schema.isBetween({ minimum: 0, maximum: 0xffff }));

export const communityKeymapIdInput = Schema.toStandardSchemaV1(communityId);

export const communityListInput = Schema.toStandardSchemaV1(
  Schema.Struct({
    compatibleWithCatalogId: optionalShortText,
    limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 50 }))),
    officialOnly: Schema.optionalKey(Schema.Boolean),
    productId: Schema.optionalKey(usbId),
    search: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(160))),
    sort: Schema.optionalKey(Schema.Literals(["likes", "new", "adoptions"])),
    tag: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(80))),
    vendorId: Schema.optionalKey(usbId),
  }),
);

export const communityAdoptInput = Schema.toStandardSchemaV1(
  Schema.Struct({
    keymapId: communityId,
    localForkId: Schema.String.check(
      Schema.isMinLength(1),
      Schema.isMaxLength(120),
      Schema.isPattern(/^[A-Za-z0-9:_-]+$/),
    ),
  }),
);

export const communityReportInput = Schema.toStandardSchemaV1(
  Schema.Struct({
    detail: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(500))),
    keymapId: communityId,
    reason: Schema.Literals(["spam", "unsafe", "misleading", "copyright", "harassment", "other"]),
  }),
);

const keyboardChoice = Schema.Struct({
  boardName: optionalShortText,
  catalogId: optionalShortText,
  displayName: shortText,
  forkId: optionalShortText,
  keyboardId: boundedId,
  productId: Schema.optionalKey(usbId),
  profileId: optionalShortText,
  vendorId: Schema.optionalKey(usbId),
});

const layoutChoice = Schema.Struct({
  displayName: shortText,
  layerNames: Schema.optionalKey(
    Schema.Array(Schema.String.check(Schema.isMaxLength(80))).check(Schema.isMaxLength(64)),
  ),
  layoutHash: optionalShortText,
  layoutId: boundedId,
  variantId: optionalShortText,
});

export const extensionDeviceIdInput = Schema.toStandardSchemaV1(boundedId);

export const extensionKeyboardChoicesInput = Schema.toStandardSchemaV1(
  Schema.Struct({
    keyboards: Schema.Array(keyboardChoice).check(Schema.isMaxLength(100)),
    layouts: Schema.Array(layoutChoice).check(Schema.isMaxLength(200)),
  }),
);

export const taggedRunsFilterInput = Schema.toStandardSchemaV1(
  Schema.Struct({
    keyboardId: optionalShortText,
    layoutId: optionalShortText,
    limit: Schema.optionalKey(Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 200 }))),
    mode: Schema.optionalKey(Schema.String.check(Schema.isMaxLength(80))),
  }),
);

export const typingRunStatsGroupInput = Schema.toStandardSchemaV1(
  Schema.Literals(["keyboard", "layout", "keyboard-layout"]),
);

export const viaKeyboardIdInput = Schema.toStandardSchemaV1(
  Schema.String.check(Schema.isMinLength(1), Schema.isMaxLength(240)),
);

export const keyboardIdentityInput = Schema.toStandardSchemaV1(
  Schema.Struct({
    productId: Schema.optionalKey(usbId),
    productName: optionalShortText,
    vendorId: Schema.optionalKey(usbId),
  }),
);

export const zmkTargetInput = Schema.toStandardSchemaV1(
  Schema.Struct({
    deviceName: shortText,
    manufacturer: optionalShortText,
  }),
);
