You are an expert Android developer specializing in Kotlin, Jetpack Compose, Clean Architecture, and Google/Firebase APIs. 

Write a fully functional, complete Android application project structure and all implementation classes for an app called **Trusela** (package `com.trusela.app`). It must exactly match the styling and features of the original web app.

---

### 1. App Concept & Value Proposition
Trusela is a secure, offline-first mobile transaction recorder and IMEI verifier for second-hand phone dealers. It acts as a digital ledger that records phone trade-ins, verifies device legality, generates high-fidelity PDF vouchers, prints Bluetooth thermal receipts, and syncs data to the dealer’s personal Google Sheets and Google Drive (which serves as their media vault). 

---

### 2. Technology Stack & Key Dependencies
Replicate the features using native Android libraries:
* **UI Framework:** Jetpack Compose (Material 3)
* **Language:** Kotlin
* **Architecture:** MVVM (Model-View-ViewModel) + Clean Architecture (Repositories, Use Cases)
* **Local Database / Caching:** Room Database (handles offline queue for transactions and IMEI caching)
* **Auth & Cloud Config:** Firebase Auth (Email/Password) + Cloud Firestore (handles users, team lists, licenses, and global IMEI flags)
* **Google Integration:** Google Sign-In SDK + Google Drive & Sheets REST API clients
* **Network & Payment:** Retrofit + OkHttp (communicating with the Paystack payment APIs)
* **Camera & Scanner:** CameraX API (with a 3:4 portrait crop overlay for profiles/IDs, and barcode scanning analyzer for IMEIs)
* **PDF & Printing:** Android `PdfDocument` engine + Android Bluetooth Socket API (ESC/POS socket writer for thermal printers)

---

### 3. UI Styling & Theme Specification
The app MUST feature premium mobile-first aesthetics:
* **Color Palette:**
  * **Navy Blue (Primary):** HSL `(210, 100%, 12%)` / Hex `#001F3F`
  * **Amber Yellow (Accent):** HSL `(48, 96%, 53%)` / Hex `#FACC15`
  * **Dark Navy Slate:** Hex `#00152B`
  * **Backgrounds:** Smooth off-white `#F8F9FA` or soft gray `#F1F3F5` for lists.
* **Layout Cards:** Rounded corners (16dp to 24dp), subtle elevation/shadows, and yellow accents.
* **Component UI styling:**
  * Clean, rounded text input fields with floating labels.
  * Step-based horizontal indicator lines representing form progress.
  * Glassmorphism overlay panels for popups (e.g. buyer forms and payment verification dialogs).
  * Dark mode compatibility with high contrast.

---

### 4. Database & Cloud Schemas
Recreate the following data models:

#### A. Firestore Schema
1. **`/users/{userId}`**:
   * `email`: String, `spreadsheetId`: String, `folderId`: String, `createdAt`: Timestamp, `subscriptionStatus`: String (enum: `trial`, `active`, `expired`, `lifetime`), `planType`: String (enum: `basic`, `manager`), `trialEndsAt`: Timestamp, `recordCount`: Int, `maxSalesPersons`: Int, `dealerName`: String, `dealerPhone`: String, `marketName`: String, `shopNumber`: String, `googleRefreshToken`: String.
2. **`/users/{userId}/salespersons/{salesPersonId}`**:
   * `name`: String, `email`: String, `phoneNumber`: String, `createdAt`: Timestamp.
3. **`/imeis/{imei}`**:
   * `count`: Int, `lastSeen`: Timestamp, `flagged`: Boolean, `reason`: String, `flaggedAt`: Timestamp.
4. **`/activationKeys/{hash}`** (SHA-256 of code `TS-XXXX-XXXX-XXXX-XXXX-XXXX`):
   * `keyId`: String, `batchId`: String, `plan`: String, `durationDays`: Int, `price`: Int, `status`: String (`unused`, `used`, `revoked`), `activatedBy`: String, `activatedByUsername`: String, `activatedDate`: Timestamp, `expiryDate`: String/Timestamp.

#### B. Google Sheets Schema
Spreadsheet contains columns A to U:
`[ID, Seller Name, Phone Number, Address, Seller Photo URL, ID Card Photo URL, Device Brand, Device Model, IMEI 1, IMEI 2, Device Image 1 URL, Device Image 2 URL, Date, Timestamp, IMEI Status, Risk Level, Device Status, Buyer Name, Buyer Phone, Buyer Address, Signature URL]`

---

### 5. Detailed Feature Implementation Requirements

#### A. Multi-Step Transaction Wizard
* **Step 1: Seller Info:** Input text fields (Name, Phone, Address). CameraX capture buttons for "Seller Photo" and "ID Card Photo" that apply a 3:4 crop overlay.
* **Step 2: Device Info:** Input text fields (Brand, Model, IMEI 1, IMEI 2). Scanner button that launches CameraX with a barcode analyzer to scan barcodes, autofilling IMEI 1. Add "Verify IMEI" button.
* **Step 3: Review & Signature Canvas:** Show previews of captured photos. Implement custom pointer-input-based `Canvas` inside Compose to capture seller's signature gesture as a Bitmap, saving it as base64 or file. Add a confirmation checkbox: *"I confirm this device is not stolen..."*.
* **Submit Action:** Check connectivity. If online, upload base64 images to Drive via Google REST APIs, append spreadsheet row via Sheets API, increment user's transaction counter in Firestore, and save IMEI registry. If offline, save the data packet to Room DB (`pending_records`).

#### B. Offline Synchronizer
* Implement an Android `WorkManager` class (`SyncWorker`) that periodically checks network connection.
* When a network transition to online occurs, query Room for queued records, upload them sequentially to Drive/Sheets, delete from local Room queue on success, and notify the user via a status toast or status bar notification.

#### C. IMEI Verifier & Luhn Validation
* Validate 15-digit input using the Luhn Algorithm.
* Look up IMEI from the `/imeis` collection in Firestore.
  * If NOT found: Status = `NEW`, Risk = `LOW`, safe to trade.
  * If found and `count > 2`: Status = `FOUND`, Risk = `MEDIUM`.
  * If `flagged == true`: Status = `FLAGGED`, Risk = `HIGH` (display the flag reason).
* Enable flagging: Allow users to flag a device as stolen, writing the record to `/imeis/{imei}` in Firestore with a reason.

#### D. Voucher Receipt Generator (PDF & Bluetooth Printing)
* **High-Fidelity PDF Receipt:** Write a class using Android's `PdfDocument` API. Draw custom vector layouts representing the Trusela voucher: Navy blue header banners, seller info block on the left, seller photo on the right, 3x1 grid showing front/back device views and ID card, attestation text, seller's signature image, and a generated verification QR code targeting `app.trusela.com/records/{recordId}`.
* **ESC/POS Bluetooth Thermal Printing:** Scan for paired Bluetooth printers. Open a GATT channel or RFCOMM Bluetooth Socket. Convert text parameters into ESC/POS binary protocols:
  * Initialize: `0x1B, 0x40`
  * Align Center: `0x1B, 0x61, 0x01`
  * Align Left: `0x1B, 0x61, 0x00`
  * Double Text Height: `0x1B, 0x21, 0x10`
  * Feed & Cut: `0x1D, 0x56, 0x42, 0x00`
  * Write text and separators in 200-byte packets to prevent socket buffer overflows.

#### E. Paystack & License Key Activator
* **Checkout Webview:** Add Paystack payment flow. Hit the initialize endpoint `/api/paystack/initialize` using Retrofit. Open the returned checkout URL inside a Compose `AndroidView(factory = { WebView(it) })` component. Listen to callback redirections to verify and activate premium status.
* **Licensing Voucher Keys:** Include a text field and scanner button. The scanner reads voucher QR codes (resolving JSON `{type: "activation", key: "TS-..."}`). Hash the input key string via SHA-256 and hit the activation endpoint, updating Firestore user subscription variables on success.

#### F. Access Guards & Team Roles
* Check user subscription status on App launch.
* If subscription is expired/trial limit is reached, restrict navigation and redirect to `/activate` view.
* If User has the `manager` role, display "Sales Team", "Inventory Tracker", and "Analytics Charts" (using native charts like MPAndroidChart or Compose-friendly canvas graphs) on the dashboard dashboard. Hide these sections for standard accounts.

---

### Output Instruction
Please write out the Android files step-by-step:
1. Provide the Android Gradle dependencies (`build.gradle.kts`).
2. Provide the domain/model classes (`User`, `SalesPerson`, `Imei`, `TransactionRecord`).
3. Provide the database code (Room entities and DAO, Firestore repository).
4. Provide the ViewModel layers handling validation, barcode scans, camera triggers, and sync queues.
5. Provide the Jetpack Compose screen components (`DashboardScreen`, `SetupScreen`, `AddRecordWizardScreen`, `RecordDetailScreen`, `LicenseActivationScreen`, `ReportsScreen`).
6. Provide the PDF and ESC/POS Bluetooth printing utility classes.
