# BulkDesk Mobile

React Native 0.82 mobile workspace for the BulkDesk field workstation.

## Commands

```bash
npm start
npm run android
npm run ios
npm run harmony:assemble
npm test -- --runInBand
npm run typecheck
npm run lint
```

For iOS native dependencies, run:

```bash
cd ios && pod install
```

The checked environment currently uses direct `pod install`; `bundle exec pod install` requires the Bundler/Ruby version recorded in `Gemfile.lock`.

## Configuration

- Inject API Base URL through local environment/config before runtime wiring.
- Do not commit production tokens, MinIO credentials, or LAN-only addresses.
- All business writes call the FastAPI API online; no offline mutation queue is used.

## Current Scope

- App shell, role navigation, React Query provider and Keychain-backed secure session.
- Login/session restore plus online dashboard, customer search, customer summary and barcode lookup screens.
- Draft order API with multi-customer workspace screen for opening, barcode product lookup, 500ms autosave, manual save and idempotent submit.
- Inventory batch API with stock-in, stock-out, stocktake, transfer submission and lookup wrappers for inventory, warehouses and suppliers.
- Delivery task API with current-task list, signature URL sign, exception and onsite return submission screens.
- Media upload validation supports JPEG, PNG and WebP evidence through `delivery-proofs`, `delivery-signatures`, and `payment-proofs` prefixes.
- API client clears secure session and React Query cache on backend `401` responses.
- Oversized images are prepared through `react-native-image-resizer` before upload and rejected if still above 10 MB.

## Verified This Pass

```bash
npm test -- --runInBand
npm run typecheck
npm run lint
```

Android and Harmony code paths are kept build-oriented for later validation; iOS is the primary verification target for this implementation pass.
