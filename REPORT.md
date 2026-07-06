# Sorting Optimizer — Code Review & Roadmap

*Analysis date: 2026-07-06 — based on v1.0.0 (working tree)*

## 1. Overall assessment

The architecture is sound for a v1:

- **Electron done right**: `contextIsolation: true`, `nodeIntegration: false`, a proper
  `preload.js` bridge exposing only 4 IPC methods. Good security hygiene.
- **Clear separation**: analysis engine (`src/logic_analyze.js`) is pure CommonJS logic,
  UI (React + Vite) only consumes its output.
- **Smart core algorithm**: `detectProcsMethodA` (exact-range test + nearest-fit fallback)
  is a clever way to reverse-engineer roll counts from the exported JSON, and the
  missPoints / set-tolerance junk heuristic is easy to reason about.

The app works, but there are real bugs, dead weight, and one architectural round-trip
worth fixing before adding features.

---

## 2. Bugs found

### 2.1 Quality filter is completely broken
`src/pages/sortingrunes.jsx:90-97` uses option values like `"5,15"`, but
`src/logic_rune.jsx:11` compares with `Number(filters.extra)`. `Number("5,15")` is `NaN`,
so selecting **any** quality filters out **every** rune.

**Fix:**
```js
if (filters.extra && !filters.extra.split(",").map(Number).includes(r.extra)) return false;
```

### 2.2 Ancient legendary runes get wrong missPoints
`src/logic_analyze.js:177` gates the heroic-max path on `rune.extra === 5` only —
ancient legendaries are `15` and silently fall through to the standard calculation.
Additionally, the call at line 178:
```js
const heroicMax = heroicExpectedMax(type, result.assigned, grade); // isAncient missing!
```
drops the 4th `isAncient` argument, so even the runes that do enter this path use
non-ancient base values.

**Fix:** `if (rune.extra === 5 || rune.extra === 15)` and pass `isAncient` through.

### 2.3 Crash risks in the modal / filters
- `getRuneComparison` (`src/logic_rune.jsx:81-135`): a rune with fewer than two non-flat
  substats makes `secondBestSub` `undefined` → `.statName` throws when the modal opens.
- `filterRunes` reads `r.mainstat.statName` while `analyzeRune` can return
  `mainstat: null` → crash on such runes.

**Fix:** null-guard both (`r.mainstat?.statName`, early-return partial comparison when
only one substat exists).

### 2.4 Icons broken in dev mode
`main.js:52` builds icon paths from `process.resourcesPath`, which only points to the
app's resources in a **packaged** build; in dev it points inside `node_modules/electron`.
Also `main.js:13` references `assets/icon.png`, which doesn't exist (the file is
`assets/icone.ico`).

**Fix:**
```js
const base = app.isPackaged
  ? path.join(process.resourcesPath, "assets", "icons")
  : path.join(__dirname, "assets", "icons");
```

### 2.5 Dev always runs stale analysis logic
`main.js:5` requires `src/la.obf.js` (the obfuscated build) even in dev, so edits to
`logic_analyze.js` do nothing until `npm run obfuscate` is rerun. Easy to lose an hour to.

**Fix:**
```js
const logicPath = app.isPackaged ? "./src/la.obf.js" : "./src/logic_analyze.js";
const { analyzeRunesFromFile } = require(logicPath);
```

---

## 3. Cleanup & efficiency

| Item | Why | Action |
|---|---|---|
| Disk round-trip in IPC | `run-analysis` writes `sorting_rune.json` then `load-sorted-runes` re-reads it | Return the results array directly from `run-analysis`; keep the file write only as an explicit "export" feature |
| `assets/icons/Seal_files/` | 5 MB of saved-webpage junk, committed **and** shipped in the installer via `assets/icons/**/*` | Delete it |
| Duplicate/dead files | `analyze_rune.js` at root **and** in `src/` (they differ!), `src/ui_old.jsx` | Keep one source of truth, delete the rest |
| Google Fonts from network | `index.html` loads Inter from fonts.googleapis.com → degrades offline | Bundle locally (`@fontsource/inter`) |
| No virtualization | 3–4k runes render as one giant grid | Paginate or use `react-window` — biggest perceived-perf win available |
| Hardcoded version | Footer says `v1.2.0`, `package.json` says `1.0.0` | Import version from `package.json` |
| `preloadIcons` | Sequential `await` per set; `new Image()` doesn't guarantee preload | `Promise.all` over unique set names |
| No tests | The heroic/ancient bug (§2.2) is exactly the kind of silent regression tests catch | Add unit tests on `analyzeRune` with a few known runes |
| Set-ID comments | `SET_TOLERANCE` / `REAP_SET_*` hardcode IDs with comments | Cross-check once against `mapping.js` and reference it as single source of truth |

---

## 4. Roadmap

### Phase 1 — Stabilize (days)
1. Fix the four bugs in §2.
2. Delete dead files + `Seal_files`, remove disk round-trip.
3. Add unit tests on `analyzeRune`.

### Phase 2 — Quality of life (1–2 weeks)
4. **Efficiency score** alongside missPoints (community-standard max-roll efficiency %) —
   players understand it instantly and it complements junk detection.
5. **Sell list view**: sorted, compact table (slot, set, +level, main stat, one
   distinguishing substat) so the player can apply it in-game in a couple of minutes.
   Exportable as text/CSV.
6. Pagination / virtualization of the rune grid.

### Phase 3 — Live workflow ("bot-like convenience, without a bot")
The goal — sort runes efficiently with minimal manual steps — does not require
automating the game client. The rune data already leaves the game passively through
SWEX's proxy; everything downstream is robust and safe to build on:

7. **Watch the SWEX export folder** (`fs.watch` / chokidar on a user-chosen directory).
   The moment the user re-exports, the app auto-reloads and re-analyzes. Zero clicks.
8. **SWEX plugin for live drops**: SWEX supports plugins that receive game events
   (rune drops, upgrades) in real time while its proxy runs. A small plugin can stream
   each new rune to this app over localhost, so "keep or sell?" is answered seconds
   after the drop, mid-farming session. This is the same mechanism the whole SW tooling
   ecosystem (SWOP, RuneManager, etc.) builds on.
9. Combine with the sell list: at the end of a farming session the app has already
   scored everything that dropped; the player sells from one screen.
10. **In-game overlay** — a passive display window on top of the game (details in §4b).

> **Note:** client automation (input injection, memory reading, auto-selling in game) is
> deliberately out of scope for this project. The SWEX-plugin route above delivers most
> of the same convenience with none of the fragility.

### Phase 3b — Overlay (details)

The natural UI for the live feed: SWEX plugin catches the drop → the app scores it →
a small panel on top of the game shows the verdict seconds later. Purely a *display* —
it never touches the game client.

**Technical approach (all native Electron, ~100–150 lines for a v1):**
- Second frameless `BrowserWindow` with `transparent: true` and
  `setAlwaysOnTop(true, "screen-saver")`.
- `setIgnoreMouseEvents(true, { forwardMouseMessages: true })` so clicks pass through
  to the game everywhere except the panel itself.
- Main process already owns the analysis pipeline; it pushes scored runes to the
  overlay renderer over IPC.
- `globalShortcut` for a toggle hotkey and a pin/unpin-last-rune hotkey.

**Constraint — game display mode:**
- Emulators (BlueStacks/LDPlayer) default to borderless windowed → overlay works
  perfectly.
- Exclusive fullscreen blocks OS-level overlays → document "use borderless mode" in
  the app; in practice almost everyone runs emulators windowed anyway.

**UX guidelines:**
- Event-driven, not a permanent HUD: hidden by default, slides in on rune drop,
  auto-fades after ~10 s.
- One glance = one decision: big KEEP/SELL verdict, efficiency %, missPoints vs
  threshold, reap flag. Full details stay in the main window.
- Optional session counter: runes dropped / keepers / estimated sells.

**Dependency:** the "score it as it drops" experience requires the SWEX plugin (§4.8)
as its data source. Build order: SWEX plugin → basic overlay → polish (hotkeys,
session stats). A weaker standalone mode (showing the sell list while cleaning
inventory) works without the plugin.

### Phase 4 — Toward a build helper (later)
- "Best N speed runes per slot" views.
- Set-completion gap analysis (extend `analyzeAccount`).
- Compare a new drop against the best owned rune of same set/slot/mainstat
  (`getRuneComparison` is already halfway there).

---

## 5. Suggested order of attack

1. §2.1 quality filter + §2.2 ancient legendary fix (correctness of core output)
2. Dead files / Seal_files / disk round-trip (hygiene)
3. Folder watching (§4.7) — small effort, huge workflow win
4. Efficiency score + sell list
5. SWEX plugin for live drops
6. Overlay on top of the SWEX plugin feed (§3b)
