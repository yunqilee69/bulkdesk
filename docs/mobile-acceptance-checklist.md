# BulkDesk Mobile Acceptance Checklist

As of 2026-07-23. iOS is the primary validation target for this implementation pass; Android and Harmony are implemented as code paths but not device-validated yet.

## Automated Gates

- Backend syntax: `cd backend && PYTHONPYCACHEPREFIX=.pycache python3 -m compileall app`
- Backend tests: `cd backend && uv run pytest`
- Frontend types: `cd frontend && npm run tsc`
- Frontend lint: `cd frontend && npm run biome:lint`
- Mobile JS tests: `cd mobile && npm test -- --runInBand`
- Mobile types: `cd mobile && npm run typecheck`
- Mobile lint: `cd mobile && npm run lint`
- iOS build: `cd mobile && xcodebuild -workspace ios/BulkDeskMobilePoc.xcworkspace -scheme BulkDeskMobilePoc -configuration Debug -sdk iphonesimulator -destination 'platform=iOS Simulator,name=iPhone 17,OS=26.2' build`

## Acceptance Matrix

| Item | Evidence | Manual iOS Step |
| --- | --- | --- |
| Login / logout / 401 cleanup | `apiClient.test.ts`, `secureSession.test.ts`, `secureSessionNative.test.ts` | Login, force token expiry or logout, confirm login screen returns and cached data clears. |
| Role overreach guard | `roleNavigation.test.ts`, `customerPermissionView.test.tsx`, `deliveryActionPermissions.test.ts` | Delivery user sees dashboard/delivery/profile only; warehouse user sees customer/order/inventory. |
| Dashboard/customer/barcode online reads | `mobileReadApi.test.ts`, `mobileReadScreens.test.tsx` | Load dashboard, search customer, open summary, scan/enter barcode and confirm live data. |
| Real QR/barcode path | `scannerDeduplication.test.ts`, `visionCameraAdapter.test.ts`, `mobileReadScreens.test.tsx` | Use iOS camera scanner path where available; fallback fixture scanner is automated only. |
| Two-customer draft switching | `draftWorkspaceModel.test.ts`, `ordersWorkspaceScreen.test.tsx`, `ordersWorkspaceAutosave.test.tsx` | Open customer A/B drafts, switch tabs, confirm quantities/remarks remain isolated and dirty drafts autosave after 500ms. |
| Draft takeover conflict path | `orderDraftsApi.test.ts`, backend `test_mobile_draft_contract.py` | Use another account to take over available draft; original owner refreshes and cannot submit stale version. |
| Barcode add-to-order | `ordersWorkspaceBarcode.test.tsx`, `mobileReadScreens.test.tsx` | Scan/enter a real barcode while a customer draft is active; confirm product lookup resolves to the backend product id before adding. |
| Idempotent draft submit | `ordersWorkspaceScreen.test.tsx`, `orderDraftsApi.test.ts`, backend `test_mobile_draft_contract.py` | Trigger transient submit failure and retry once; confirm one placed order and one stock lock. |
| Four inventory operations | `inventoryApi.test.ts`, `inventoryOperationModel.test.ts`, `inventoryBatchModel.test.ts`, `inventoryBatchScreen.test.tsx` | Submit stock-in, stock-out, stocktake and transfer batches from scanner/manual inputs; use inventory lookup for warehouse/supplier context. |
| Delivery current/detail/actions | `deliveryApi.test.ts`, `deliveryScreensApi.test.tsx`, `deliveryActionPermissions.test.ts` | Open a current delivery, inspect detail, exception history, navigation button and role-gated actions. |
| Continuous signature / photo proof | `signatureModel.test.ts`, `signatureExport.test.ts`, `deliverySignModel.test.ts`, `deliverySignScreen.test.tsx`, `deliveryScreensApi.test.tsx` | Draw signature, capture site photo, upload and confirm sign button enables only after required media. |
| Payment collection proof | `deliverySignModel.test.ts`, `deliverySignScreen.test.tsx`, `deliveryScreensApi.test.tsx` | Enable collection, enter amount, capture payment proof, submit and confirm backend paid fields. |
| Photo/signature Web echo | backend `test_mobile_delivery_signature.py`, frontend `delivery.test.ts` | In Web delivery detail, confirm proof photos and independent signature image render separately. |
| Delivery exception | `deliveryScreensApi.test.tsx`, backend delivery tests | Submit `other` exception; confirm remark is required and appears in delivery history. |
| Onsite return | `deliveryScreensApi.test.tsx`, backend return-order tests | Load returnable items, select quantity/condition/stock-in warehouse, submit and confirm return no. |
| Media validation / compression | `validateImage.test.ts`, `prepareUploadImage.test.ts`, `upload.test.ts` | Upload JPEG/PNG/WebP proof; oversized image is compressed or blocked before upload. |
| DB schema | DBX query; backend migration tests | Confirm draft tables, submission indexes and `order_deliveries.signature_image_url` exist. |

## Platform Matrix

| Capability | iOS Simulator | Android | Harmony |
| --- | --- | --- | --- |
| JS tests/type/lint | Verified | Code only | Code only |
| Native dependency install | Verified by direct CocoaPods | Not verified | Not verified |
| App build | Verified Debug simulator build | Not verified | Not verified |
| Camera/signature runtime | POC and workflow code retained; manual runtime pending | Code only | Code only |
| Media upload prefixes | `delivery-proofs`, `delivery-signatures`, `payment-proofs` | Code only | Code only |

## DBX Verification Query

```sql
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('order_drafts', 'order_draft_items', 'order_draft_events', 'order_draft_submissions')
ORDER BY table_name;

SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'order_deliveries'
  AND column_name = 'signature_image_url';
```
