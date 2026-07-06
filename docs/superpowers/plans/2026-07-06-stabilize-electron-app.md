# Sorting Optimizer — Stabilize & Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the correctness bugs found in REPORT.md (verified against the current tree), add unit tests around the analysis engine, remove ~6 MB of dead weight, and clean up the Electron dev/build pipeline.

**Architecture:** Electron app (main: `main.js`, preload bridge: `preload.js`) + React 19 renderer bundled by Vite (`src/ui.jsx`). Pure analysis engine in CommonJS (`src/logic_analyze.js`, obfuscated to `src/la.obf.js` for shipping). No changes to this architecture — only fixes inside it.

**Tech Stack:** Electron 39, Vite 7, React 19, electron-builder 24, vitest (added by this plan).

**Corrections vs REPORT.md** (the report was written against an older tree):
- The quality filter UI lives in `src/ui.jsx:168-175`, not `src/pages/sortingrunes.jsx` (that file doesn't exist).
- `src/ui_old.jsx` and the root-level `analyze_rune.js` are already gone. The remaining duplicate is `src/analyze_rune.js` (an old standalone CLI superseded by `logic_analyze.js`).
- `index.html` does **not** load Google Fonts, and there is no hardcoded `v1.2.0` footer — both items are stale, skip them.
- **New bug found:** `src/logic_analyze.js:135` sets `procTotal = rune.extra - 1`; for ancient runes (`extra` 11–15) that allows up to 14 procs instead of 4. Fixed in Task 3.
- **New issue found:** Vite outputs the renderer bundle to `dist/` and electron-builder *also* outputs the installer to `dist/` (confirmed in `dist/builder-effective-config.yaml`). Fixed in Task 9.

---

### Task 0: Put the project under git

The project is not a git repository. Everything after this task assumes commits work.

**Files:**
- Create: `.gitignore`

- [ ] **Step 1: Create `.gitignore`**

```gitignore
node_modules/
dist/
release/
src/la.obf.js

# local data exports (player account data, analysis outputs)
Roikku7-*.json
sorting_rune*.json
rune_sw.xlsx
```

- [ ] **Step 2: Init repo and make the baseline commit**

```bash
git init
git add -A
git commit -m "chore: baseline before stabilization work"
```

Expected: commit succeeds; `git status` shows a clean tree. `dist/` (build output incl. the installer) and the personal JSON exports must NOT appear in `git status`.

---

### Task 1: Test harness (vitest)

vitest is chosen because the codebase mixes CommonJS (`logic_analyze.js`) and ESM/JSX (`logic_rune.jsx`); vitest handles both without config.

**Files:**
- Modify: `package.json` (scripts + devDependencies)
- Create: `tests/smoke.test.js`

- [ ] **Step 1: Install vitest**

```bash
npm install --save-dev vitest
```

- [ ] **Step 2: Add the test script to `package.json`**

In the `"scripts"` block add:

```json
"test": "vitest run"
```

- [ ] **Step 3: Write a smoke test proving both module styles load**

Create `tests/smoke.test.js`:

```js
import { describe, it, expect } from "vitest";
import { analyzeRunesFromData } from "../src/logic_analyze.js";
import { filterRunes } from "../src/logic_rune.jsx";

describe("smoke", () => {
  it("imports the CJS analysis engine", () => {
    expect(typeof analyzeRunesFromData).toBe("function");
  });
  it("imports the ESM filter module", () => {
    expect(typeof filterRunes).toBe("function");
  });
});
```

- [ ] **Step 4: Run it**

Run: `npm test`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json tests/smoke.test.js
git commit -m "test: add vitest harness with smoke test"
```

---

### Task 2: Failing tests for the ancient-legendary bug (§2.2) and procTotal bug

**Files:**
- Create: `tests/logic_analyze.test.js`

Background for the fixture shape: `analyzeRune` consumes raw SWEX rune objects:
`{ rune_id, slot_no, set_id, class, extra, upgrade_curr, pri_eff: [type, value], prefix_eff: [type, value], sec_eff: [[type, value, gemFlag, gemValue], ...] }`.
`extra` is quality: 1–5 normal, 11–15 ancient (5/15 = legendary). Substat type 8 = SPD.
For SPD, `getBaseAndProcValues` resolves base 4–6 (normal) / 5–7 (ancient), proc 4–6 (mapping.js has no `min` table, so the hardcoded fallbacks always apply — deterministic).

- [ ] **Step 1: Write the failing tests**

Create `tests/logic_analyze.test.js`:

```js
import { describe, it, expect } from "vitest";
import { analyzeRunesFromData } from "../src/logic_analyze.js";

function makeRune(overrides) {
  return {
    rune_id: 1,
    slot_no: 2,
    set_id: 13, // Violent
    class: 6,
    extra: 5,
    upgrade_curr: 12,
    pri_eff: [8, 40],   // SPD main
    prefix_eff: [0, 0],
    sec_eff: [],
    ...overrides,
  };
}

function analyzeOne(rune) {
  return analyzeRunesFromData({ runes: [rune] })[0];
}

describe("analyzeRune — legendary miss points", () => {
  it("normal legendary SPD uses the heroic cap (regression)", () => {
    // SPD 26, base 4–6, proc 4–6 → assigned 4 (window [20,30])
    // heroic max = 6 + 3*6 = 24 → miss = max(0, 24-26) = 0
    const r = analyzeOne(makeRune({ extra: 5, sec_eff: [[8, 26, 0, 0]] }));
    expect(r.missPoints).toBe(0);
  });

  it("ancient legendary SPD also uses the heroic cap with ancient bases", () => {
    // SPD 29, ancient base 5–7, proc 4–6 → assigned 4 (window [21,31])
    // heroic max = 7 + 3*6 = 25 → miss = max(0, 25-29) = 0
    // Bug: extra===15 falls to the standard path → miss = (7+4*6)-29 = 2
    const r = analyzeOne(makeRune({ extra: 15, sec_eff: [[8, 29, 0, 0]] }));
    expect(r.isAncient).toBe(1);
    expect(r.missPoints).toBe(0);
  });

  it("ancient runes get at most 4 procs (extra % 10), not extra - 1", () => {
    const r = analyzeOne(makeRune({ extra: 15, sec_eff: [] }));
    expect(r.procTotal).toBe(4); // bug: currently 14
  });
});
```

- [ ] **Step 2: Run and verify they fail for the right reason**

Run: `npm test`
Expected: first test PASSES; the two ancient tests FAIL (`missPoints` 2 instead of 0, `procTotal` 14 instead of 4).

- [ ] **Step 3: Commit the failing tests**

```bash
git add tests/logic_analyze.test.js
git commit -m "test: expose ancient-legendary missPoints and procTotal bugs"
```

---

### Task 3: Fix the ancient-legendary and procTotal bugs

**Files:**
- Modify: `src/logic_analyze.js:135` (procTotal) and `src/logic_analyze.js:176-179` (heroic path)
- Test: `tests/logic_analyze.test.js`

- [ ] **Step 1: Fix `procTotal`**

In `analyzeRune`, replace:

```js
const procTotal = Math.max(0, rune.extra - 1);
```

with:

```js
const procTotal = Math.max(0, (rune.extra % 10) - 1); // extra 11–15 = ancient qualities
```

- [ ] **Step 2: Fix the heroic path gate and pass `isAncient`**

Replace:

```js
if (rune.extra === 5) {
  const heroicMax = heroicExpectedMax(type, result.assigned, grade);
```

with:

```js
if (rune.extra === 5 || rune.extra === 15) {
  const heroicMax = heroicExpectedMax(type, result.assigned, grade, isAncient);
```

- [ ] **Step 3: Run the tests**

Run: `npm test`
Expected: all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add src/logic_analyze.js
git commit -m "fix: ancient legendary runes use heroic cap and correct proc count"
```

---

### Task 4: Fix the quality filter (§2.1)

**Files:**
- Modify: `src/logic_rune.jsx:11`
- Test: `tests/logic_rune.test.js` (create)

- [ ] **Step 1: Write the failing test**

Create `tests/logic_rune.test.js`:

```js
import { describe, it, expect } from "vitest";
import { filterRunes } from "../src/logic_rune.jsx";

const noFilters = {
  slot: "", set: "", extra: "", miss: "",
  mainstat: "", substat: "", substatOrder: "desc",
};

function makeAnalyzed(overrides) {
  return {
    rune_id: 1,
    slot: 2,
    set_name: "Violent",
    extra: 5,
    missPoints: 0,
    reap: 0,
    mainstat: { statName: "SPD", value: 40 },
    breakdown: [],
    ...overrides,
  };
}

describe("filterRunes — quality filter", () => {
  const data = [
    makeAnalyzed({ rune_id: 1, extra: 5 }),   // normal legend
    makeAnalyzed({ rune_id: 2, extra: 15 }),  // ancient legend
    makeAnalyzed({ rune_id: 3, extra: 4 }),   // hero
  ];

  it('keeps both normal and ancient legends for extra "5,15"', () => {
    const out = filterRunes(data, { ...noFilters, extra: "5,15" }, false);
    expect(out.map(r => r.rune_id)).toEqual([1, 2]);
  });
});
```

- [ ] **Step 2: Run and verify it fails**

Run: `npm test`
Expected: FAIL — the filter returns `[]` because `Number("5,15")` is `NaN`.

- [ ] **Step 3: Fix `filterRunes`**

In `src/logic_rune.jsx`, replace:

```js
    if (filters.extra && r.extra !== Number(filters.extra)) return false;
```

with:

```js
    if (filters.extra && !filters.extra.split(",").map(Number).includes(r.extra)) return false;
```

- [ ] **Step 4: Run the tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/logic_rune.jsx tests/logic_rune.test.js
git commit -m "fix: quality filter handles comma-separated values like 5,15"
```

---

### Task 5: Null-guards against modal / filter crashes (§2.3)

**Files:**
- Modify: `src/logic_rune.jsx` (`filterRunes` line 13, `getRuneComparison` lines 49-103)
- Modify: `src/ui.jsx` (modal lines 31 and 62-63)
- Test: `tests/logic_rune.test.js` (extend)

- [ ] **Step 1: Write the failing tests**

Append to `tests/logic_rune.test.js` (reuses `makeAnalyzed` / `noFilters` from Task 4):

```js
import { getRuneComparison } from "../src/logic_rune.jsx";

describe("crash guards", () => {
  it("filterRunes tolerates mainstat: null", () => {
    const data = [makeAnalyzed({ mainstat: null })];
    expect(() => filterRunes(data, { ...noFilters, mainstat: "SPD" }, false)).not.toThrow();
    expect(filterRunes(data, { ...noFilters, mainstat: "SPD" }, false)).toEqual([]);
  });

  it("getRuneComparison tolerates a rune with a single non-flat substat", () => {
    const rune = makeAnalyzed({
      breakdown: [{ statName: "SPD", current: 20 }],
    });
    const cmp = getRuneComparison(rune, [rune]);
    expect(cmp.bestSub.statName).toBe("SPD");
    expect(cmp.secondBestSub).toBeNull();
  });

  it("getRuneComparison tolerates comparison pool runes with mainstat: null", () => {
    const rune = makeAnalyzed({
      breakdown: [
        { statName: "SPD", current: 20 },
        { statName: "CRI Dmg", current: 14 },
      ],
    });
    const pool = [rune, makeAnalyzed({ rune_id: 99, mainstat: null })];
    expect(() => getRuneComparison(rune, pool)).not.toThrow();
  });
});
```

- [ ] **Step 2: Run and verify the new tests fail**

Run: `npm test`
Expected: the three new tests FAIL (TypeError on `.statName` of `undefined`/`null`).

- [ ] **Step 3: Guard `filterRunes`**

In `src/logic_rune.jsx`, replace:

```js
    if (filters.mainstat && r.mainstat.statName !== filters.mainstat) return false;
```

with:

```js
    if (filters.mainstat && r.mainstat?.statName !== filters.mainstat) return false;
```

- [ ] **Step 4: Guard `getRuneComparison`**

In `src/logic_rune.jsx`, apply these changes inside `getRuneComparison`:

```js
  const nonFlatSubs = selectedRune.breakdown.filter(s => !s.statName.includes("flat"));
  const sortedSubs = [...nonFlatSubs].sort((a,b)=> b.current - a.current);
  const bestSub = sortedSubs[0];
  const secondBestSub = sortedSubs[1] ?? null;

  if (!bestSub) return null;

  const sameSetSlotMain = data.filter(r =>
    r.set_name === selectedRune.set_name &&
    r.slot === selectedRune.slot &&
    r.mainstat?.statName === selectedRune.mainstat?.statName
  );
```

Then make every use of `secondBestSub` conditional:

```js
  const maxSecond = secondBestSub
    ? Math.max(...sameSetSlotMain.map(r => {
        const stat = r.breakdown.find(s => s.statName === secondBestSub.statName);
        return stat ? stat.current : 0;
      }))
    : null;

  const countBetterBoth = secondBestSub
    ? sameSetSlotMain.filter(r => {
        if (r.rune_id === selectedRune.rune_id) return false;
        const stat1 = r.breakdown.find(s => s.statName === bestSub.statName);
        const stat2 = r.breakdown.find(s => s.statName === secondBestSub.statName);
        return stat1 && stat2 && stat1.current >= bestSub.current && stat2.current >= secondBestSub.current;
      }).length
    : null;

  const messages = [];
  if (countBetterBest === 0) {
    messages.push(`C’est la meilleure rune sur sa substat principale (${bestSub.statName}) !`);
  }
  if (secondBestSub && countBetterBoth === 0) {
    messages.push(`C’est la meilleure combinaison sur ${bestSub.statName} + ${secondBestSub.statName} !`);
  }
```

(`countBetterBest` and `maxBest` are unchanged.)

- [ ] **Step 5: Guard the modal rendering in `src/ui.jsx`**

Line 31, replace:

```jsx
        <p><b>Main Stat:</b> {rune.mainstat.statName} {rune.mainstat.value}</p>
```

with:

```jsx
        <p><b>Main Stat:</b> {rune.mainstat?.statName} {rune.mainstat?.value}</p>
```

Lines 62-63, wrap the second-substat lines so they only render when present:

```jsx
            {cmp.secondBestSub && (
              <>
                <p>2ème substat : <b>{cmp.secondBestSub.statName}</b> ({cmp.secondBestSub.current}) — max : {cmp.maxSecond}</p>
                <p>Nombre de runes meilleures sur les deux : <b>{cmp.countBetterBoth}</b></p>
              </>
            )}
```

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add src/logic_rune.jsx src/ui.jsx tests/logic_rune.test.js
git commit -m "fix: null-guard modal comparison and filters against sparse runes"
```

---

### Task 6: Fix main-process paths — icons in dev, fresh logic in dev (§2.4, §2.5)

No unit tests here (Electron main process); verification is manual via dev launch.

**Files:**
- Modify: `main.js:5` (logic require), `main.js:13` (window icon), `main.js:51-54` (get-icon-path)

- [ ] **Step 1: Load the un-obfuscated engine in dev**

Replace line 5:

```js
const { analyzeRunesFromFile } = require("./src/la.obf.js");
```

with (note: `app` is already required on line 1):

```js
const logicPath = app.isPackaged ? "./src/la.obf.js" : "./src/logic_analyze.js";
const { analyzeRunesFromFile } = require(logicPath);
```

- [ ] **Step 2: Fix the window icon**

`assets/icon.png` does not exist; the real file is `assets/icone.ico`. Replace line 13:

```js
    icon: path.join(__dirname, "assets", "icon.png"),
```

with:

```js
    icon: path.join(__dirname, "assets", "icone.ico"),
```

- [ ] **Step 3: Fix `get-icon-path` for dev**

`process.resourcesPath` only points at the app resources when packaged. Replace the handler body:

```js
ipcMain.handle("get-icon-path", async (event, name) => {
  const base = app.isPackaged
    ? path.join(process.resourcesPath, "assets", "icons")
    : path.join(__dirname, "assets", "icons");
  return path.join(base, `${name}.png`);
});
```

- [ ] **Step 4: Manual verification**

Terminal 1: `npm run dev` (Vite on http://localhost:5173)
Terminal 2: `npm start`
Load `Roikku7-7294441.json` via the button. Expected: window shows the taskbar icon, set icons render on rune cards, and an edit to `src/logic_analyze.js` (e.g. a `console.log`) is picked up after restarting `npm start` without running `npm run obfuscate`.

Note: set-icon `<img>` tags load absolute `file://` paths returned by IPC; if the renderer refuses them, prefix the returned path with `file://` in the handler — check the DevTools console during this step.

- [ ] **Step 5: Commit**

```bash
git add main.js
git commit -m "fix: dev-mode icon paths and un-obfuscated logic loading"
```

---

### Task 7: Remove the disk round-trip in IPC (§3)

`run-analysis` currently writes `sorting_rune.json` and `load-sorted-runes` re-reads it. Return the results directly; keep the file write as a debug/export artifact.

**Files:**
- Modify: `main.js:58-88`, `preload.js`, `src/ui.jsx:232-241`

- [ ] **Step 1: Make `run-analysis` return the results array**

In `main.js`, replace the `run-analysis` handler's success path and delete the `load-sorted-runes` handler entirely:

```js
ipcMain.handle("run-analysis", async (event, inputFile) => {
  try {
    const results = analyzeRunesFromFile(inputFile);

    // Export de debug (facultatif, non lu par l'app)
    const outputFile = path.join(app.getPath("userData"), "sorting_rune.json");
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));

    return results;
  } catch (err) {
    console.error("Erreur analyse:", err);
    throw new Error("Analyse échouée");
  }
});
```

- [ ] **Step 2: Remove `loadSortedRunes` from `preload.js`**

```js
contextBridge.exposeInMainWorld("electronAPI", {
  selectJsonFile: () => ipcRenderer.invoke("select-json-file"),
  runAnalysis: (filePath) => ipcRenderer.invoke("run-analysis", filePath),
  getIconPath: (name) => ipcRenderer.invoke("get-icon-path", name)
});
```

- [ ] **Step 3: Use the returned array in `src/ui.jsx`**

In `App.selectFile`, replace:

```js
    await window.electronAPI.runAnalysis(filePath);
    const analyzedRunes = await window.electronAPI.loadSortedRunes();
    setRunes(analyzedRunes);
```

with:

```js
    const analyzedRunes = await window.electronAPI.runAnalysis(filePath);
    setRunes(analyzedRunes);
```

- [ ] **Step 4: Manual verification**

`npm run dev` + `npm start`, load the sample JSON. Expected: rune count and grid appear exactly as before.

- [ ] **Step 5: Commit**

```bash
git add main.js preload.js src/ui.jsx
git commit -m "refactor: return analysis results over IPC instead of disk round-trip"
```

---

### Task 8: Delete dead weight

Verified dead before deletion (nothing imports them):
- `assets/icons/Seal_files/` — 5.1 MB of saved-webpage junk, also shipped in the installer via `files: ["assets/icons/**/*"]`.
- `src/analyze_rune.js` — old standalone CLI, superseded by `src/logic_analyze.js`.
- `src/index.css` — not imported anywhere (`ui.jsx` imports `style.css`; `index.html` links nothing).
- `rune-app/` — stray vanilla-Vite scaffold, unrelated to the app.
- `vendor/` — babel/react dev builds from a pre-Vite era; `index.html` no longer references them.
- `sorting_rune_old.json`, `sorting_rune_2.json` — stale analysis outputs (already gitignored; delete from disk).

Keep: `icone/` at the project root — it is the browser-only dev fallback (`/icone/<set>.png` served by Vite when `window.electronAPI` is absent). Keep `Roikku7-7294441.json` and `rune_sw.xlsx` (personal data, gitignored).

**Files:**
- Delete: everything listed above
- Modify: `package.json` (`build.files`)

- [ ] **Step 1: Delete the files**

```bash
rm -rf assets/icons/Seal_files rune-app vendor
rm src/analyze_rune.js src/index.css sorting_rune_old.json sorting_rune_2.json
```

- [ ] **Step 2: Stop double-shipping icons in the installer**

Icons are already copied by `extraResources`; remove the redundant glob from `build.files` in `package.json`. The `files` array becomes:

```json
"files": [
  "dist/**/*",
  "main.js",
  "preload.js",
  "package.json",
  "src/la.obf.js",
  "mapping.js"
],
```

- [ ] **Step 3: Verify nothing broke**

Run: `npm test` → all PASS.
Run: `npm run dev` + `npm start`, load the sample JSON → app works, icons render.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: remove dead files and 5MB of saved-webpage junk from the installer"
```

---

### Task 9: Separate build outputs and verify packaging

Vite writes the renderer bundle to `dist/` and electron-builder also writes the installer to `dist/` (its default). Point electron-builder at `release/`.

**Files:**
- Modify: `package.json` (`build.directories`)

- [ ] **Step 1: Set the electron-builder output directory**

In `package.json`, extend `build.directories`:

```json
"directories": {
  "buildResources": "assets",
  "output": "release"
},
```

- [ ] **Step 2: Clean the old mixed output**

```bash
rm -rf dist
```

- [ ] **Step 3: Full build**

Run: `npm run dist`
Expected: `dist/` contains only the Vite bundle (`index.html`, `assets/`); `release/` contains `Account Optimizer Setup 1.0.0.exe` and `win-unpacked/`.

- [ ] **Step 4: Smoke-test the packaged app**

Run: `release/win-unpacked/Account Optimizer.exe`
Expected: app opens, loading the sample JSON works, set icons render (they come from `process.resourcesPath` in packaged mode).

- [ ] **Step 5: Commit**

```bash
git add package.json
git commit -m "build: separate electron-builder output (release/) from vite bundle (dist/)"
```

---

### Task 10: Parallel icon preloading

`RuneViewer` awaits `getIconPath` once per rune sequentially — thousands of sequential IPC round-trips for a few dozen unique sets.

**Files:**
- Modify: `src/ui.jsx:115-128` (the `loadIcons` effect)

- [ ] **Step 1: Replace the effect**

```jsx
  useEffect(() => {
    async function loadIcons() {
      const uniqueSets = [...new Set(data.map((r) => r.set_name))];
      const entries = await Promise.all(
        uniqueSets.map(async (setName) => {
          const src = window.electronAPI?.getIconPath
            ? await window.electronAPI.getIconPath(setName)
            : `/icone/${setName}.png`;
          return [setName, src];
        })
      );
      setIcons(Object.fromEntries(entries));
    }
    loadIcons();
  }, [data]);
```

- [ ] **Step 2: Manual verification**

`npm run dev` + `npm start`, load the sample JSON. Expected: icons appear noticeably faster; no console errors.

- [ ] **Step 3: Commit**

```bash
git add src/ui.jsx
git commit -m "perf: preload set icons in parallel over unique sets only"
```

---

## Future work (explicitly NOT in this plan)

From REPORT.md phases 2–4, in the report's suggested order of attack:

1. **Folder watching** — chokidar on the SWEX export dir; auto re-analyze on re-export.
2. **Efficiency score** — community-standard max-roll efficiency % alongside missPoints.
3. **Sell list view** — compact sorted table, exportable as text/CSV.
4. **Grid virtualization** — `react-window` or pagination for 3–4k rune grids.
5. **SWEX plugin for live drops** → **in-game overlay** (transparent always-on-top window).

Each of these should get its own brainstorm + plan once this stabilization plan is merged.
