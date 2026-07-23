# RN/RNOH Device Capability POC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Prove on iOS, Android, and HarmonyOS that `react-native@0.82.1` + `@react-native-oh/react-native-harmony@0.82.30` can reliably scan barcodes and QR codes, capture/upload images, and capture/upload handwritten signatures for BulkDesk.

**Architecture:** Create an isolated `mobile/` React Native POC rather than modifying the existing Umi Web application. Business pages call stable TypeScript capability interfaces; per-platform implementations and any ArkTS bridge code live behind those interfaces. A POC-only screen exercises each capability independently, then an integrated “delivery proof” flow captures a photo and signature and uploads both to the existing authenticated upload API.

**Tech Stack:** `react-native@0.82.1`, `@react-native-oh/react-native-harmony@0.82.30`, TypeScript, React Navigation, TanStack Query, the selected RNOH-compatible scanner/camera/native-module packages, Jest, FastAPI `/api/v1/upload`, MinIO.

---

## Scope and non-goals

**In scope**

- Barcode scanning: at minimum EAN-13, Code 128, and Code 39; report decoded value, symbology, timestamp, and duplicate-scan suppression.
- QR-code scanning: parse a local BulkDesk test payload, invalid payload, expired payload, and repeated scans.
- Photo proof: camera permission, capture, preview, retake, JPEG/PNG validation, authenticated multipart upload, retry, and cleanup of local temporary files.
- Handwritten signature: draw, clear, undo, resize/orientation recovery, export a PNG, upload, and show the returned URL/key.
- Cross-cutting verification: secure token storage, request cancellation, offline and retry behavior, customer/merchant cache isolation, release builds, privacy permissions, and crash/log capture.

**Out of scope for this POC**

- Creating formal orders from a scanned temporary-order QR code; the corresponding customer/temporary-order backend API does not exist yet.
- Treating a PNG as a legally or operationally complete signature proof. The generic upload API has no immutable link to a delivery/order, signer identity, consent text, timestamp, hash, or audit trail.
- Push notifications, Bluetooth printers, background inventory writes, payment, and a full customer/merchant application.

## Verified existing backend constraints

- `POST /api/v1/upload` requires a Bearer token, accepts multipart field `file`, and supports JPEG and PNG files up to 10 MB.
- The endpoint returns `data.key`, `data.url`, `data.filename`, `data.content_type`, and `data.size`; this is the success contract used by this POC.
- POC uploads use prefixes `mobile-poc/photos` and `mobile-poc/signatures`, so they can be identified and cleaned up without mixing with production business files.

## Files and responsibilities

| Path | Responsibility |
| --- | --- |
| `mobile/package.json` | Locks React Native, RNOH, testing scripts, and native capability packages selected by the compatibility inventory. |
| `mobile/src/platform/contracts.ts` | Defines scanner, camera, signature-export, storage, and upload TypeScript contracts used by UI code. |
| `mobile/src/platform/scanner/` | Scanner adapter, duplicate suppression, QR payload validation, and platform bridge selection. |
| `mobile/src/platform/media/` | Camera/gallery adapter, temporary-file lifecycle, image metadata validation, and permissions. |
| `mobile/src/platform/signature/` | Stroke model, PNG export adapter, and portrait/landscape preservation. |
| `mobile/src/api/client.ts` | Authenticated HTTP client with timeout, cancellation, response parsing, and refresh hook seam. |
| `mobile/src/api/upload.ts` | `multipart/form-data` upload client for photo and signature assets. |
| `mobile/src/features/poc/` | Three isolated test screens and one integrated delivery-proof screen. |
| `mobile/src/security/secureSession.ts` | Platform-backed token storage wrapper; no token is written to AsyncStorage or logs. |
| `mobile/src/__tests__/` | Unit and integration-style tests for all contracts and failure paths. |
| `mobile/docs/plugin-compatibility-matrix.md` | Exact package/version, iOS/Android/HarmonyOS result, native bridge owner, and replacement path. |
| `mobile/docs/manual-test-matrix.md` | Device-level, permission-level, network-level, and release-build acceptance record. |
| `docs/superpowers/specs/2026-07-21-rn-rnoh-device-poc-design.md` | Approved POC design, explicit test payloads, and planned platform boundary. |

## Device matrix and test artefacts

Before coding, name one physical device for each row and record OS/build versions in `mobile/docs/manual-test-matrix.md`:

| Platform | Mandatory device | Minimum runs |
| --- | --- | --- |
| iOS | Physical iPhone running the target supported iOS version | Development and release builds |
| Android | Mid-range physical Android phone running the target supported Android version | Development and release builds |
| HarmonyOS | Physical target HarmonyOS device, not only an emulator | Development and signed release-equivalent build |

Use physical printed/displayed test codes for every scanner scenario. Fixture values must be checked into `mobile/src/features/poc/scanFixtures.ts`:

```ts
export const scanFixtures = {
  ean13: '6901234567892',
  code128: 'BULKDESK-ORDER-001',
  code39: 'SKU-ABC-123',
  validTemporaryOrderQr: 'bulkdesk://temporary-order/poc-valid-v1',
  expiredTemporaryOrderQr: 'bulkdesk://temporary-order/poc-expired-v1',
  invalidQr: 'https://example.invalid/not-a-bulkdesk-code',
} as const;
```

### Task 1: Freeze the RN/RNOH compatibility baseline

**Files:**
- Create: `mobile/package.json`
- Create: `mobile/README.md`
- Create: `mobile/docs/plugin-compatibility-matrix.md`
- Create: `mobile/docs/manual-test-matrix.md`

- [ ] **Step 1: Create the compatibility inventory before adding any production dependency.**

  Add one row for each mandatory capability: scanner with barcode/QR recognition, camera capture, gallery fallback, image resize/compression, signature canvas/export, file cleanup, secure storage, permission requests, and network status. Each row must state the exact npm package or internal bridge, exact version, the `react-native@0.82.1` + RNOH `0.82.30` compatibility evidence, iOS/Android/HarmonyOS build status, bridge owner, and fallback.

  Required decision rule:

  ```text
  A capability is “supported” only after the exact locked version builds and passes its
  manual test on all three physical platforms. Repository claims or a sample targeting
  another RNOH version are evidence for a spike, not acceptance evidence.
  ```

- [ ] **Step 2: Scaffold the isolated React Native project and lock versions.**

  Create `mobile/` from the React Native `0.82.1` template, add `@react-native-oh/react-native-harmony@0.82.30`, and use npm lockfiles. Keep the POC outside `frontend/`; do not mix Umi or Ant Design Pro build configuration into native builds.

  Add scripts with these names:

  ```json
  {
    "test": "jest --runInBand",
    "test:watch": "jest --watch",
    "typecheck": "tsc --noEmit",
    "lint": "biome check src",
    "poc:report": "node scripts/render-poc-report.mjs"
  }
  ```

- [ ] **Step 3: Validate base builds before feature work.**

  Run the generated iOS, Android, and HarmonyOS build commands for the locked versions. Record command, commit SHA, success/failure, device model, OS version, and screenshot in `mobile/docs/manual-test-matrix.md`.

  Expected outcome: all three apps launch a blank TypeScript screen; any failed native build blocks subsequent feature work.

### Task 2: Establish test-first platform contracts and safe session handling

**Files:**
- Create: `mobile/src/platform/contracts.ts`
- Create: `mobile/src/security/secureSession.ts`
- Create: `mobile/src/api/client.ts`
- Create: `mobile/src/__tests__/secureSession.test.ts`
- Create: `mobile/src/__tests__/apiClient.test.ts`

- [ ] **Step 1: Write failing unit tests for token handling and HTTP headers.**

  Test that a token is delegated to the secure-storage adapter, is never returned in application logs, and is attached as `Authorization: Bearer <token>` to upload requests. Test that `401`, timeout, network failure, and malformed `{ code, message, data }` responses are distinguishable.

  ```ts
  it('adds the bearer token without exposing it in diagnostics', async () => {
    await secureSession.saveAccessToken('secret-token');
    await apiClient.post('/upload', new FormData());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer secret-token' }) }),
    );
    expect(logger.info).not.toHaveBeenCalledWith(expect.stringContaining('secret-token'));
  });
  ```

- [ ] **Step 2: Run the focused tests and confirm they fail before implementation.**

  Run: `cd mobile && npm test -- secureSession.test.ts apiClient.test.ts`

  Expected: failure because the session/client contracts do not exist.

- [ ] **Step 3: Implement minimal contracts and adapters.**

  Define `ScanResult`, `CapturedImage`, `SignatureImage`, `UploadResult`, and `PlatformCapabilityError` in `contracts.ts`. Keep UI-independent interfaces such as:

  ```ts
  export interface Scanner {
    scanOnce(): Promise<ScanResult>;
  }

  export interface MediaCapture {
    capturePhoto(): Promise<CapturedImage>;
    removeLocalFile(uri: string): Promise<void>;
  }
  ```

  Ensure secure storage is injected behind an interface and no production code falls back to plaintext AsyncStorage for tokens.

- [ ] **Step 4: Re-run focused tests, type check, and lint.**

  Run:

  ```bash
  cd mobile
  npm test -- secureSession.test.ts apiClient.test.ts
  npm run typecheck
  npm run lint
  ```

  Expected: all commands exit `0`.

### Task 3: Implement and verify barcode plus QR-code scanning

**Files:**
- Create: `mobile/src/platform/scanner/scanResult.ts`
- Create: `mobile/src/platform/scanner/validateQrPayload.ts`
- Create: `mobile/src/platform/scanner/createScanner.ts`
- Create: `mobile/src/features/poc/ScannerPocScreen.tsx`
- Create: `mobile/src/features/poc/scanFixtures.ts`
- Create: `mobile/src/__tests__/validateQrPayload.test.ts`
- Create: `mobile/src/__tests__/scannerDeduplication.test.ts`

- [ ] **Step 1: Write failing tests for payload validation and duplicate suppression.**

  Validate the `bulkdesk://temporary-order/<id>` scheme locally, reject invalid schemes and expired POC payloads, and suppress repeats of the same `(value, symbology)` within a 1,500 ms window. Do not claim an order is created in this POC.

  ```ts
  it('accepts a valid BulkDesk temporary-order QR payload', () => {
    expect(validateQrPayload(scanFixtures.validTemporaryOrderQr)).toEqual({ kind: 'temporary-order', id: 'poc-valid-v1' });
  });

  it('suppresses repeated EAN-13 reads within 1,500 ms', () => {
    expect(shouldAcceptScan({ value: scanFixtures.ean13, format: 'ean-13' }, 1_000)).toBe(true);
    expect(shouldAcceptScan({ value: scanFixtures.ean13, format: 'ean-13' }, 2_000)).toBe(false);
  });
  ```

- [ ] **Step 2: Run scanner tests and confirm they fail.**

  Run: `cd mobile && npm test -- validateQrPayload.test.ts scannerDeduplication.test.ts`

  Expected: failure before `validateQrPayload` and duplicate-suppression logic are implemented.

- [ ] **Step 3: Implement scanner adapter and POC screen.**

  The screen must request camera permission only after the user presses “开始扫码”, show a live preview, display decoded `value` and `format`, pause after an accepted scan, and offer “继续扫码”. The capability contract must expose whether a result is barcode or QR rather than inferring it from text.

  Support and visibly test these symbologies:

  ```text
  Barcode: EAN-13, Code 128, Code 39
  QR: valid BulkDesk temporary-order payload, expired payload, invalid external payload
  ```

  If the selected scanner package fails on the RN `0.82.1` + RNOH `0.82.30` combination on one platform, create a narrow `NativeScanner` bridge rather than changing UI code. Update the compatibility matrix with the bridge API and owner.

- [ ] **Step 4: Run automated scanner tests.**

  Run:

  ```bash
  cd mobile
  npm test -- validateQrPayload.test.ts scannerDeduplication.test.ts
  npm run typecheck
  npm run lint
  ```

  Expected: all commands exit `0`.

- [ ] **Step 5: Perform the physical-device scanner matrix.**

  On every matrix device, scan each fixture 30 times under normal light and 10 times under low light. Record success count, median time to result, wrong symbology count, permission-denied behavior, camera-cancel behavior, repeated-scan suppression, background/foreground recovery, and release-build result.

  Acceptance: 30/30 normal-light decodes for each required fixture, no duplicate accepted scan within 1,500 ms, no crash after permission denial or foreground recovery, and no UI dependency on order-creation APIs.

### Task 4: Implement and verify photo capture plus authenticated upload

**Files:**
- Create: `mobile/src/platform/media/validateImage.ts`
- Create: `mobile/src/platform/media/createMediaCapture.ts`
- Create: `mobile/src/api/upload.ts`
- Create: `mobile/src/features/poc/PhotoUploadPocScreen.tsx`
- Create: `mobile/src/__tests__/validateImage.test.ts`
- Create: `mobile/src/__tests__/upload.test.ts`
- Modify: `mobile/docs/manual-test-matrix.md`

- [ ] **Step 1: Write failing image and upload tests.**

  Cover accepted JPEG/PNG files, rejected unsupported MIME type, rejected files exceeding 10 MB, HTTP `401`, server `400`, timeout, retry without duplicate UI state, and successful parsing of the current upload response.

  ```ts
  it('uploads a camera JPEG to the photo POC prefix', async () => {
    const result = await uploadProof(photo, 'mobile-poc/photos');
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/upload?prefix=mobile-poc%2Fphotos'),
      expect.objectContaining({ method: 'POST', headers: expect.objectContaining({ Authorization: expect.stringMatching(/^Bearer /) }) }),
    );
    expect(result).toEqual(expect.objectContaining({ key: expect.any(String), url: expect.any(String), contentType: 'image/jpeg' }));
  });
  ```

- [ ] **Step 2: Run focused tests and confirm they fail.**

  Run: `cd mobile && npm test -- validateImage.test.ts upload.test.ts`

  Expected: failure because media validation and the upload service are not implemented.

- [ ] **Step 3: Implement capture, preview, upload, retry, and cleanup.**

  Request camera permission only after the capture action. Permit a gallery selection only as an explicit fallback. Validate MIME and byte size before upload. Convert unsupported camera output to JPEG/PNG if the selected package produces another format. Set the upload prefix to `mobile-poc/photos`, clear temporary files after successful upload or explicit discard, and retain only an explicit retry draft after failure.

  Do not log the Bearer token, raw photo data, or public URL in debug telemetry.

- [ ] **Step 4: Re-run automated tests and backend integration.**

  Run:

  ```bash
  cd mobile
  npm test -- validateImage.test.ts upload.test.ts
  npm run typecheck
  npm run lint
  ```

  Then, with a dedicated authenticated POC employee, upload one JPEG and one PNG to the running FastAPI service and record the returned `key`, MIME type, and byte size. Clean them up with `DELETE /api/v1/upload` after acceptance is recorded.

- [ ] **Step 5: Perform physical-device media acceptance.**

  Verify camera denied, camera granted, capture, preview, retake, gallery fallback, slow network, offline retry, app kill during pending retry, image rotation/orientation, a 9.9 MB accepted file, and a file above 10 MB rejected before transfer. Repeat on all three devices in development and release builds.

  Acceptance: successful upload yields the expected backend response; rejected permissions and failed requests have recoverable UI states; no temporary file remains after success/discard; no duplicate upload is issued by one user action.

### Task 5: Implement and verify handwritten signature capture and PNG upload

**Files:**
- Create: `mobile/src/platform/signature/signatureModel.ts`
- Create: `mobile/src/platform/signature/createSignatureExporter.ts`
- Create: `mobile/src/features/poc/SignaturePocScreen.tsx`
- Create: `mobile/src/__tests__/signatureModel.test.ts`
- Create: `mobile/src/__tests__/signatureExport.test.ts`
- Modify: `mobile/src/api/upload.ts`
- Modify: `mobile/docs/manual-test-matrix.md`

- [ ] **Step 1: Write failing tests for signature state and export requirements.**

  Test that a blank canvas cannot upload; a signed canvas can clear and undo; an export produces a non-empty PNG with a `signature` filename and the required `image/png` MIME; screen rotation retains strokes or explicitly asks the user to re-sign before export.

  ```ts
  it('does not allow upload before at least one stroke exists', () => {
    expect(canSubmitSignature({ strokes: [] })).toBe(false);
  });

  it('exports a completed signature as a PNG upload payload', async () => {
    const image = await exportSignature({ strokes: [sampleStroke] });
    expect(image).toEqual(expect.objectContaining({ contentType: 'image/png', filename: expect.stringMatching(/^signature-.*\.png$/) }));
  });
  ```

- [ ] **Step 2: Run focused tests and confirm they fail.**

  Run: `cd mobile && npm test -- signatureModel.test.ts signatureExport.test.ts`

  Expected: failure before the signature model and exporter are implemented.

- [ ] **Step 3: Implement the signature POC screen and exporter.**

  Provide a full-width signing area with “撤销”, “清空”, “重新签名”, and “上传签名” actions. Disable upload for an empty canvas. Export PNG through the selected cross-platform library or a narrow native bridge, then call `uploadProof(signature, 'mobile-poc/signatures')`.

  Keep the capture/export boundary behind `SignatureExporter`; no delivery/order component may know whether the image came from SVG, canvas, or a native surface.

- [ ] **Step 4: Re-run automated tests and API integration.**

  Run:

  ```bash
  cd mobile
  npm test -- signatureModel.test.ts signatureExport.test.ts upload.test.ts
  npm run typecheck
  npm run lint
  ```

  Upload one exported PNG on each device and verify that the returned object reports `image/png`, non-zero `size`, and a `mobile-poc/signatures` key. Delete POC objects after evidence is captured.

- [ ] **Step 5: Perform physical-device signature acceptance.**

  Validate finger input, stylus input when the target device has one, dense/sparse strokes, clear/undo, portrait/landscape transition, app background/foreground, upload retry, and release build. Compare the server-stored PNG visually with the on-screen signature.

  Acceptance: no lost or corrupted strokes, blank signatures cannot upload, exported signature is legible, and each non-empty signature uploads exactly once per explicit user action.

### Task 6: Validate cross-cutting production blockers

**Files:**
- Create: `mobile/src/features/poc/DeliveryProofPocScreen.tsx`
- Create: `mobile/src/__tests__/workspaceIsolation.test.ts`
- Create: `mobile/src/__tests__/retryQueue.test.ts`
- Modify: `mobile/docs/manual-test-matrix.md`
- Modify: `mobile/docs/plugin-compatibility-matrix.md`

- [ ] **Step 1: Write failing tests for workspace and retry boundaries.**

  Assert that a customer-to-merchant switch clears the prior workspace query cache and unsent sensitive proof draft; assert that offline retries never run stock/order writes; assert that cancelling an upload prevents a late response from updating a discarded screen.

  ```ts
  it('clears customer proof drafts before entering the merchant workspace', async () => {
    await proofDrafts.save('customer', samplePhotoDraft);
    await switchWorkspace('merchant');
    expect(await proofDrafts.load('customer')).toBeNull();
  });
  ```

- [ ] **Step 2: Run focused tests and confirm they fail.**

  Run: `cd mobile && npm test -- workspaceIsolation.test.ts retryQueue.test.ts`

  Expected: failure because workspace cleanup and retry constraints are not implemented.

- [ ] **Step 3: Build an integrated delivery-proof POC flow.**

  The flow is intentionally not connected to delivery completion: scan a valid fixture, capture a photo, draw a signature, upload both, display their returned keys, and allow cleanup. This proves capability composition without inventing an unsupported order/delivery write path.

- [ ] **Step 4: Implement only the required cross-cutting safeguards.**

  - Use secure storage for tokens and clear it on logout.
  - Clear workspace-specific cached proof drafts on role/workspace switch.
  - Permit retries only for photo/signature uploads; retry only after an explicit user action in this POC.
  - Disable capture/upload actions while an operation is active and support cancellation.
  - Emit redacted diagnostics containing platform, app build, capability name, error class, and elapsed time—never token, image bytes, or signed image URL.

- [ ] **Step 5: Run full automated POC validation.**

  Run:

  ```bash
  cd mobile
  npm test
  npm run typecheck
  npm run lint
  ```

  Expected: all commands exit `0`.

- [ ] **Step 6: Validate release, privacy, and failure behavior on all devices.**

  For iOS, Android, and HarmonyOS release-equivalent builds, validate camera/photo-library permissions, permission denial and later recovery, TLS connection to the configured API, offline mode, airplane-mode recovery, background/foreground recovery, invalid/expired QR, invalid barcode, upload cancellation, and crash-free restart.

  Acceptance: all capability paths have a user-visible recovery route; no secret is shown in UI/logs; no test is accepted on emulator-only evidence.

### Task 7: Make the go/no-go decision and identify required backend work

**Files:**
- Modify: `mobile/docs/plugin-compatibility-matrix.md`
- Modify: `mobile/docs/manual-test-matrix.md`
- Modify: `docs/mobile-technology-selection-2026-07-21.md`
- Create: `docs/testing/rn-rnoh-device-poc-result-2026-07-21.md`

- [ ] **Step 1: Produce a capability evidence table.**

  For every capability and every physical platform, capture: exact app/RNOH/package versions, device and OS, development/release build result, pass/fail count, video/screenshot/log reference, known issue, owner, and fallback. A blank evidence cell is a failed acceptance item.

- [ ] **Step 2: Apply the decision rule.**

  ```text
  GO: all three platforms pass barcode, QR, photo upload, signature export/upload,
      secure token storage, permission denial/recovery, and release build checks.

  CONDITIONAL GO: only non-critical cosmetic issues remain, each has an owner and
      a dated remediation before the first business feature.

  NO-GO: any platform lacks a stable scanner, camera/upload, signature export,
         secure storage, or release build; switch to the documented uni-app x fallback
         before building customer or merchant workflows.
  ```

- [ ] **Step 3: Record backend prerequisites for a production signature feature.**

  Before connecting signatures to delivery/return/order completion, write a separate backend design and implementation plan for a signed-proof record containing at least: related business document ID, uploaded file key, operation type, signer display name/identity policy, operator ID, server timestamp, consent text/version, immutable audit fields, and authorization rules. Do not use the generic upload URL as the sole delivery-signature record.

- [ ] **Step 4: Confirm scope coverage before requesting implementation approval.**

  Verify the result document contains all required barcode formats, QR fixtures, photo upload cases, signature cases, and cross-cutting checks listed in this plan. Confirm that source code, dependency lockfile, device evidence, and backend-gap decision are all available for review.

## Additional validation required beyond the requested three capabilities

1. **Permissions and privacy declarations:** camera, photo library, notification (if introduced), denial/recovery, and production privacy text for each store.
2. **Secure session handling:** token storage, refresh failure, logout cleanup, no token/image data in logs, and TLS-only API configuration.
3. **Network resilience:** timeout, cancellation, offline retry, duplicate user taps, app restart, and no local inventory/order writes while offline.
4. **Identity/workspace isolation:** customer and merchant navigation/cache/proof drafts are never shared after switching or logout.
5. **Release engineering:** signed iOS/Android/HarmonyOS builds, target-device installation, startup, crash capture, and minimum OS compatibility.
6. **Plugin lifecycle:** locked package versions, RNOH compatibility evidence, update owner, native bridge fallback, and a regression matrix on every upgrade.
7. **Business-proof integrity:** a future signed-proof backend record and audit contract; the POC's PNG upload only validates device capability, not legal or operational proof semantics.
