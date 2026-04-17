# Codebase audit report

Read-only review. No code was modified as part of this audit. Line numbers refer to the repository state at audit time.

---

## Critical (breaks functionality)

| Location | What is wrong | What it should be |
|----------|---------------|-------------------|
| `dashboard.html` ~61–64, ~68–80 | `import.meta.env.VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are **Vite compile-time** values. Plain `dashboard.html` served as static HTML typically receives **undefined**, so `createClient` is misconfigured and dashboard data calls fail. | Build dashboard through Vite, inject env at build, or use a small config script / Netlify env exposure pattern documented for static pages. |
| `dashboard.html` ~7–12 | `link rel="canonical"` and `og:url` / `og:image` contain a **broken hostname**: `https://insuranceMedical Bill Dispute Pro.com/...` (space in URL). Invalid URLs harm SEO and social previews. | Single canonical domain string without spaces (e.g. production hostname). |
| `netlify/functions/generate-pdf.js` ~72–94 | Multi-page PDF logic is **broken**: when `yPosition < margin`, a `newPage` is created and one line is drawn there, but the loop **never reassigns** `page` to `newPage`. Subsequent lines with `yPosition >= margin` still draw on the **original** `page`, causing overlapping text or content off the first page. | Track `let currentPage = page` and assign `currentPage = newPage` when adding pages; draw all subsequent lines on `currentPage`. |
| `upload.html` ~830–845 (`startOver`) | Resets `state` and clears file, EOB radios, letter body, errors, and `step6-main`. It **does not** reset Step 1 fields (`bill-date`, `provider-type`, `total-billed`, `insurance-status`), Step 2–5 inputs, or Step 3 UI. User sees **stale form data** while `state` is fresh → **desync** and wrong submissions if they continue. | Clear all wizard inputs and re-initialize Step 3–6 visibility/content, or reload the page on “Start over”. |
| `upload.html` ~488–492 (`runAnalysis`) | `const btnNextRun = document.getElementById('step3-next');` then `btnNextRun.disabled = ...` with **no null check**. Missing element → runtime throw and analysis flow stops. | Guard: `if (btnNextRun) { ... }`. |

---

## Major (degrades UX significantly)

| Location | What is wrong | What it should be |
|----------|---------------|-------------------|
| `upload.html` ~788–790 (`runLetterGeneration`) | `const lb = document.getElementById('letter-body');` then `lb.textContent = ...` with **no null guard**. | `if (!lb) throw or return` before use. |
| `upload.html` ~548–625 (`renderStep3`) | Uses `hs`, `content`, `btnNext` and various `getElementById` nodes with **assumption they exist** (e.g. `hs.style.display`). | Null-check critical nodes or early return with error UI. |
| `dashboard.html` ~111–119 (`displayRecentLetters`) | Builds HTML with `innerHTML` and interpolates `doc.file_name` (and dates). If data is ever unsanitized, this is an **XSS** vector. | Escape user-controlled strings or build DOM with `textContent` / `createElement`. |
| `upload.html` ~292 (`letter-body`) | Letter is injected with `textContent` (good), but the field is **`contenteditable="true"`**. Users can paste rich HTML; **`innerText`** for copy/PDF mitigates export some, but stored DOM can still differ from plain text expectations. | Document risk or use a plain `<textarea>` / read-only pre for generated letter. |
| `netlify/functions/analyze-medical-bill.js` ~332–333 | `JSON.parse(rawText)` on model output — malformed JSON yields **500** with generic error. Acceptable but **no** structured fallback for partial responses. | Optional: validate shape before parse; user-facing message differentiation. |
| `upload.html` vs `index.html` / `examples.html` **nav** | `upload.html` nav links use `#94a3b8`; `index.html` / `examples.html` use `#f5f5f5` and slightly different padding. Inconsistent chrome across marketing vs wizard. | Align nav styles and link set (same order, same colors). |
| `examples.html` | **No FAQ JSON-LD**; `index.html` has full `FAQPage` schema (~24–54). Inconsistent structured data for SEO. | Add FAQ schema to examples if FAQs exist, or document intentional omission. |
| `examples.html` ~107–109 CTA | Copy says “appeal letter” / insurance denial framing; primary product elsewhere is **medical bill dispute**. Mixed messaging vs homepage. | Align CTA copy with product positioning. |
| `dashboard.html` ~133–134 | Plan shows **“Pro (Active)”** only if a `claim_letters` row exists with `payment_status === 'paid'`; otherwise **“Free”**. No Stripe/subscription integration in this snippet — “Pro” may not reflect real entitlements. | Tie plan label to actual billing/subscription source of truth. |

---

## Minor (polish/consistency)

| Location | What is wrong | What it should be |
|----------|---------------|-------------------|
| `upload.html` ~372 | `console.log` in `renderProgress()` on every step change. Noisy in production. | Remove or gate behind a debug flag. |
| `upload.html` ~914–916, etc. | `console.log('[drop-zone] ...')` for click/drop/paste. | Same as above. |
| `upload.html` `state.letterRaw` ~787 | Set from API response; **no other reads** found in the same file — effectively unused for logic. | Use or remove to avoid confusion. |
| `netlify/functions/analyze-medical-bill.js` `normalizePayload(raw, ctx)` ~140 | Second parameter `ctx` / `body` is **unused**. | Remove unused param or document purpose. |
| `index.html` ~18–22, `examples.html` ~17–21 | AdSense `ca-pub-XXXXXXXXXXXXXXXX` **placeholder** still present (TODO comment acknowledges). | Replace with real publisher ID before production ads. |
| `index.html` ~100 | Hero shows **“$29 • Delivered in 10 minutes”**; meta description also **$29**. Pricing page consistent. Good baseline. | Ensure every customer-facing page uses same price (spot-check other HTML files). |
| `examples.html` hero / CTA | Trust row under CTA like `index.html` (~121–124: secure checkout, etc.) is **not** mirrored on examples page. | Optional parity for conversion consistency. |
| `dashboard.html` cards ~31–52 | Background `#1e293b`, borders `#334155` — **dark theme consistent** with site. | None required; noted as verified. |
| `dashboard.html` ~101–108 | **Empty state** implemented when `documents.length === 0` with emoji + CTA to `/payment.html`. | Verified working pattern. |

---

## Verified Working

### 1. `upload.html` — ID map (JS → HTML)

All **static** IDs referenced via `getElementById('...')` match elements in the same file:

| ID | Present in HTML |
|----|-----------------|
| `wizard-progress` | Yes (~23) |
| `wiz-circle-1` … `wiz-circle-6`, `wiz-label-1` … `wiz-label-6` | Yes (~26–47) |
| `step1-container` … `step6-container` | Yes |
| `file-drop-zone`, `file-drop-default`, `file-upload`, `file-drop-selected`, `file-drop-check`, `file-drop-filename`, `file-drop-clear`, `file-drop-error` | Yes |
| `bill-date`, `provider-type`, `total-billed`, `insurance-status`, `step1-error`, `step1-next` | Yes |
| `network-status`, `service-type`, `prior-contact`, `deadline-warning`, `step2-error`, `step2-back`, `step2-next` | Yes |
| `step3-loading`, `step3-loading-text`, `step3-hardstop`, `step3-content`, `analysis-deadline-flag`, `analysis-error-type`, `analysis-risk-level`, `analysis-regulatory-hooks`, `analysis-cpt-findings`, `analysis-summary`, `analysis-error-cards`, `step3-error`, `step3-back`, `step3-next` | Yes |
| `step4-container`, `selected-strategy-display`, `strategy-cards`, `step4-error`, `step4-back`, `step4-next` | Yes |
| `patient-name`, `account-number`, `date-of-service`, `provider-name`, `disputed-amount`, `specific-charges`, `specific-charges-hint`, `resolution-ask`, `step5-error`, `step5-back`, `step5-next` | Yes |
| `step6-loading`, `step6-main`, `letter-body`, `attorney-note`, `btn-copy`, `btn-pdf`, `btn-docx`, `btn-start-over`, `step6-error` | Yes |

**Dynamic IDs:** `strategy-card-${safeStrategyDomId(s.id)}` — created in JS when strategies render; **no orphan ID in HTML** (by design).

**`showEl(id, on)`:** Uses string IDs passed as literals (`step3-loading`, etc.); all correspond to existing elements.

**`setError(id, msg)`:** Uses `step1-error` … `step6-error`; all exist.

**No silent failure from “missing static ID”** for the above. Runtime risk remains if DOM is altered (see Critical null guards).

---

### 2. `upload.html` — File input paths (click / drag-drop / paste)

| Path | Listener attached? | Handler | `applyStep1FileSelection` reachable? |
|------|---------------------|---------|----------------------------------------|
| **Click** | Yes — `fileDropZone.addEventListener('click', …)` inside `initStep1DropZone()` ~939–943 | Logs, skips if `e.target === fileUpload`, else `fileUpload.click()` | Yes — `change` on `fileUpload` calls `applyStep1FileSelection(f)` ~931–936 |
| **Drag/drop** | Yes — `dragenter`, `dragover`, `dragleave`, `drop` with `{ capture: true }` ~945–968 | `preventDefault` + `stopPropagation`; `dropEffect = 'copy'` on dragover; drop calls `applyStep1FileSelection(f)` | Yes |
| **Paste** | Yes — `window.addEventListener('paste', …)` registered inside `initStep1DropZone()` ~978–985 | Only if `currentStep === 1`; `getClipboardFile` uses `files[0]` or `items` + `getAsFile()`; then `applyStep1FileSelection(f)` | Yes |

**Init timing:** `initStep1DropZone()` runs on `DOMContentLoaded` if `document.readyState === 'loading'`, else immediately ~987–991 — **after** `#file-drop-zone` and `#file-upload` exist in document order.

**`applyStep1FileSelection`** (~865–910): Sets `state.file`, uses `DataTransfer` to assign `input.files`, toggles `#file-drop-default` / `#file-drop-selected`, sets filename line, error UI — **defined and used** by all three paths and `change`.

---

### 3. `upload.html` — Wizard flow and visibility

| Transition | Trigger | Functions / effects | `state` updates (high level) | UI |
|------------|---------|----------------------|------------------------------|-----|
| **→ Step 2** | `#step1-next` click ~1003+ | Validates file + fields; `fileToBase64`; `showStep(2)`; `updateDeadlineUI()` | `billDate`, `providerType`, `totalBilled`, `insuranceStatus`, `fileBase64` (file already in `state.file`) | `step1-container` hidden; `step2` shown; `renderProgress()` |
| **→ Step 3** | `#step2-next` ~1050+ | Validates; `computeDeadlineWarning`; `showStep(3)`; `runAnalysis()` | `networkStatus`, `serviceType`, `hasEOB`, `priorContact` | Step 3 shown; loading/analysis UI toggled inside `runAnalysis` / `renderStep3` |
| **Step 3 API** | `runAnalysis()` ~488+ | `syncWizardAccessToken`; `fetch` analyze; on success `state.analysis = data`; `renderStep3(data)` | `analysis` | Loading off; content or hard-stop |
| **→ Step 4** | `#step3-next` ~1082+ | `showStep(4)`; `renderStrategyCards()` | `strategy` set inside card renderer | Step 4 + strategy cards |
| **→ Step 5** | `#step4-next` ~1090+ | `showStep(5)`; `applyStep5Prefill()` | (strategy already set) | Step 5 |
| **→ Step 6** | `#step5-next` ~1101+ | Validates; sets patient fields; `showStep(6)`; `runLetterGeneration()` | `patientName`, `accountNumber`, `dateOfService`, `providerName`, `disputedAmount`, `specificCharges`, `resolutionAsk` | Step 6 loading then letter |

`showStep(n)` (~361–367): sets `currentStep`, toggles `step{i}-container` display, calls `renderProgress()`.

---

### 4. `upload.html` — State keys

| Key | Set | Read | Reset in `startOver()` |
|-----|-----|------|------------------------|
| `accessToken` | `syncWizardAccessToken` | Analyze + letter `fetch` bodies | `initialState()` → null, then async `sync` overwrites |
| `file` | `applyStep1FileSelection`, Step 1 flow | Step 1 Next, analysis payload (via `fileBase64`) | Cleared via `initialState` + `applyStep1FileSelection(null)` |
| `fileBase64` | Step 1 Next after `fileToBase64` | `runAnalysis` body | `initialState` |
| `billDate`, `providerType`, `totalBilled`, `insuranceStatus` | Step 1 Next | Analyze + letter bodies | `initialState` only — **DOM not cleared** (see Critical) |
| `networkStatus`, `serviceType`, `hasEOB`, `priorContact` | Step 2 Next | Analyze + letter | `initialState` — **DOM not cleared** |
| `deadlineWarning` | `computeDeadlineWarning` | `renderStep3`, deadline flag UI | `initialState` |
| `analysis` | `runAnalysis` success | Step 4–6, letter generation | `initialState` |
| `strategy` | `renderStrategyCards` / card select | Step 4 Next, letter | `initialState` |
| `patientName`, `accountNumber`, `dateOfService`, `providerName`, `disputedAmount`, `specificCharges`, `resolutionAsk` | Step 5 Next | Letter `fetch` | `initialState` — **DOM not cleared** |
| `prefillApplied` | `applyStep5Prefill` | Guard inside `applyStep5Prefill` | `initialState` |
| `letterRaw` | `runLetterGeneration` | *(no further reads in file)* | `initialState` |

---

### 5. `upload.html` — `fetch` calls

| Call | Endpoint | Request body keys | Expected success shape | Error handling |
|------|----------|-------------------|------------------------|----------------|
| Analyze | `/.netlify/functions/analyze-medical-bill` | `fileBase64`, `billDate`, `providerType`, `totalBilled`, `insuranceStatus`, `networkStatus`, `serviceType`, `hasEOB`, `priorContact`, `accessToken` | JSON: `success` not `false`; normalized analysis object (see function) | `res.ok` and `data.success === false` → throw; parse errors → throw |
| Letter | `/.netlify/functions/generate-medical-bill-letter` | `analysis`, `strategy`, `patientName`, `accountNumber`, `dateOfService`, `providerName`, `disputedAmount`, `specificCharges`, `resolutionAsk`, `billDate`, `networkStatus`, `serviceType`, `hasEOB`, `priorContact`, `accessToken` | `{ success: true, letter: string }` | `!res.ok \|\| !data.success` → throw |
| PDF / DOCX | `/.netlify/functions/generate-pdf`, `generate-docx` | `{ text, fileName }` from `letter-body` **innerText** | Binary: `Content-Type` pdf or wordprocessingml; base64 body on Netlify | `downloadBinaryFunction`: status, content-type check, `res.blob()` |

---

### 6. `upload.html` — innerHTML / letter content

- **No `innerHTML` assignment** for letter text. Letter set with **`textContent`** (~789–790).
- **`contenteditable`** on `#letter-body` still allows user-edited DOM; copy/PDF use **`innerText`** (~1140, ~1146, ~1155) — attorney note is **outside** `#letter-body`, so it **does not** leak into exports unless user copies full page manually.

---

### 7. `netlify/functions/analyze-medical-bill.js`

**Expected body keys:** `fileBase64`, `billDate`, `providerType`, `totalBilled`, `insuranceStatus`, `networkStatus`, `serviceType`, `hasEOB`, `priorContact`, `accessToken` (~190–200).

**Match to `upload.html`:** **Yes** — same keys in `JSON.stringify` (~512–522).

**Returns:** `normalizePayload` output (~155–176): `success`, `riskLevel`, `errorTypes`, `detectedErrors`, `regulatoryHooks`, `availableStrategies`, `recommendedStrategy`, `summaryForUser`, `hardStop`, `hardStopReason`. Error responses: `{ success: false, error }` with 400/401/500.

**`renderStep3` expectations:** Uses `data.hardStop`, `hardStopReason`, `errorTypes`, `riskLevel`, `regulatoryHooks`, `detectedErrors`, `summaryForUser` — **aligned** with normalized shape.

**Unguarded access:** `JSON.parse(rawText)` can throw → caught → 500. `extractBillText` throws on bad mime → caught. Reasonable.

---

### 8. `netlify/functions/generate-medical-bill-letter.js`

**Expected body keys:** `analysis`, `strategy`, `patientName`, `accountNumber`, `dateOfService`, `providerName`, `disputedAmount`, `specificCharges`, `resolutionAsk`, `billDate`, `networkStatus`, `serviceType`, `hasEOB`, `priorContact`, `accessToken` (~29–44).

**Match to `upload.html`:** **Yes** (~759–774).

**Returns:** `{ success: true, letter: string }` (~161–164). **Step 6** expects `data.success` and `data.letter` — **match**.

**Errors:** 401/400/403/500 with JSON `error` / `success: false` — client maps to thrown `Error`.

---

### 9. `netlify/functions/_wizardAuth.js` & `src/_wizardAuth.js`

**Bypass:** If `WIZARD_ALLOW_BYPASS` is truthy (`envTruthy`) **and** (`!accessToken` **or** `accessToken === 'bypass'`), returns `{ ok: true, bypass: true }` (~11–14). If bypass is false and token missing or `'bypass'`, returns 401 path (~17–18). **Behavior is coherent** for staging bypass.

**`syncWizardAccessToken`:** Sets `state.accessToken = session?.access_token ?? 'bypass'` (~8). So client **always** sends a string; server accepts `'bypass'` when env allows.

**Timing:** `bootWizard` **awaits** `syncWizardAccessToken` before `showStep(1)` (~1175–1178). Analyze/letter also **await** sync before `fetch`. **No obvious race** for token on those calls.

---

### 10. `generate-pdf.js` & `generate-docx.js`

**Payload:** Both parse `text` and optional `fileName` from JSON body (~18). **Matches** Step 6 buttons (`text: letterText`, `fileName: '...'`).

**Blob compatibility:** Return `isBase64Encoded: true` with binary MIME types (~99–107 pdf, ~51–59 docx). **`fetch(...).blob()`** in the client works with Netlify base64 encoding.

**Attorney note:** Not included in `text` — only `letter-body` **innerText** is sent — **does not leak** into PDF/DOCX by default.

---

### 11. `dashboard.html`

- **Plan status:** Derived dynamically from Supabase `claim_letters` query (~126–136) — not a hardcoded string except fallback em dash / “Free” / “Pro (Active)”.
- **Empty state:** Implemented when no documents (~101–108).
- **Card backgrounds:** `#1e293b` panels on `#0f172a` body — **dark theme consistent**.

---

### 12. `index.html` & `examples.html`

| Check | `index.html` | `examples.html` |
|-------|--------------|-----------------|
| Nav links | Home, Examples, Pricing, Login, Terms (~83–87) | Same set (~31–35) |
| `upload.html` nav | Uses same labels; **colors differ** (see Major) | — |
| **$29** | Hero + CTA + meta (~9–10, ~100, ~120) | CTA ~109 “$29” |
| **AdSense placeholder** | Yes (~18–22) | Yes (~17–21) |
| **Trust under CTA** | Yes (~121–124) | Not the same block |
| **FAQ schema** | Yes `FAQPage` (~24–54) | **Absent** |

---

## Summary counts

- **Critical:** 5 items  
- **Major:** 9 items  
- **Minor:** 9 items  
- **Verified:** Contracts for analyze/letter functions, auth bypass semantics, drop-zone wiring, ID map for static elements, dashboard empty state + dark cards, index FAQ + $29 + AdSense placeholder  

---

*End of report.*
