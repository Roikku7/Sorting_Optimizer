const { app, BrowserWindow, dialog, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const logicPath = app.isPackaged ? "./src/la.obf.js" : "./src/logic_analyze.js";
const { analyzeRunesFromFile } = require(logicPath);

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 1000,
    icon: path.join(__dirname, "assets", "icone.ico"),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  if (!app.isPackaged) {
    // En dev → Vite doit tourner sur localhost:5173
    mainWindow.loadURL('http://localhost:5173');
  } else {
    // En prod → on charge le bundle généré par Vite
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }

  mainWindow.on('closed', () => (mainWindow = null));
}

app.whenReady().then(createWindow);

// ---------------------------------------------------
// IPC — Choisir un fichier JSON
// ---------------------------------------------------
ipcMain.handle('select-json-file', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Sélectionnez votre fichier JSON de runes',
    filters: [{ name: 'JSON Files', extensions: ['json'] }],
    properties: ['openFile']
  });

  if (result.canceled) return null;
  return result.filePaths[0];
});

// ---------------------------------------------------
// IPC — Récupérer chemin d’icône
// ---------------------------------------------------
ipcMain.handle("get-icon-path", async (event, name) => {
  const base = app.isPackaged
    ? path.join(process.resourcesPath, "assets", "icons")
    : path.join(__dirname, "assets", "icons");
  return path.join(base, `${name}.png`);
});
// ---------------------------------------------------
// IPC — Lancer l’analyse Node
// ---------------------------------------------------
ipcMain.handle("run-analysis", async (event, inputFile) => {
  try {
    const results = analyzeRunesFromFile(inputFile);

    // Sauvegarde du JSON de sortie
    const outputFile = path.join(app.getPath("userData"), "sorting_rune.json");
    fs.writeFileSync(outputFile, JSON.stringify(results, null, 2));

    return outputFile; // renvoie le chemin du fichier
  } catch (err) {
    console.error("Erreur analyse:", err);
    throw new Error("Analyse échouée");
  }
});

// ---------------------------------------------------
// IPC — Charger sorting_rune.json dans l’UI
// ---------------------------------------------------
ipcMain.handle("load-sorted-runes", async () => {
  try {
    const outputFile = path.join(app.getPath("userData"), "sorting_rune.json");
    if (!fs.existsSync(outputFile)) {
      throw new Error("Fichier d'analyse introuvable");
    }
    const raw = fs.readFileSync(outputFile, "utf8");
    return JSON.parse(raw);
  } catch (err) {
    console.error("Erreur lecture:", err);
    throw err;
  }
});
