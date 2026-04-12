import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const curfilename = fileURLToPath(import.meta.url);
const curdirname = path.dirname(curfilename);

function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(curdirname, '../preload/preload.cjs'),
      nodeIntegration: true,
      webSecurity: true,
      contextIsolation: true,
    },
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173/');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(curdirname, '../../dist/index.html'));
  }
}

const getAppPath = () => {
  if (app.isPackaged) {
    return path.dirname(app.getPath('exe'));
  } else {
    return path.join(__dirname, '../..');
  }
};

const ensureDataDirExists = () => {
  const dataPath = path.join(getAppPath(), 'data');
  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
  }
  return dataPath;
};

const ensureDirectoryExists = (relativePath) => {
  const basePath = ensureDataDirExists();
  const fullPath = path.join(basePath, ...relativePath.split('/'));
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
  return fullPath;
};

function setupIPC() {
  ipcMain.handle('directory-exists', async (event, { path: dirPath }) => {
    try {
      const basePath = ensureDataDirExists();
      const fullPath = path.join(basePath, dirPath);
      const exists = fs.existsSync(fullPath);
      return { success: true, exists };
    } catch (error) {
      console.error('Error checking directory:', error);
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('create-directory', async (event, { path: dirPath }) => {
    try {
      const fullPath = ensureDirectoryExists(dirPath);
      return { success: true, path: fullPath };
    } catch (error) {
      console.error('Error creating directory:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle saving a file
  ipcMain.handle('save-file', async (event, { filename, data, directory }) => {
    try {
      // Create the directory if it doesn't exist
      const dirPath = directory ? ensureDirectoryExists(directory) : ensureDataDirExists();
      const filePath = path.join(dirPath, filename);
      fs.writeFileSync(filePath, data);
      return { success: true, path: filePath };
    } catch (error) {
      console.error('Error saving file:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle reading a file
  ipcMain.handle('read-file', async (event, { filename }) => {
    try {
      const dataPath = ensureDataDirExists();
      const filePath = path.join(dataPath, filename);
      if (!fs.existsSync(filePath)) {
        return { success: false, error: 'File does not exist' };
      }
      const data = fs.readFileSync(filePath, 'utf8');
      return { success: true, data };
    } catch (error) {
      console.error('Error reading file:', error);
      return { success: false, error: error.message };
    }
  });

  // Handle listing files in the data directory
  ipcMain.handle('list-files', async () => {
    try {
      const dataPath = ensureDataDirExists();
      const files = fs.readdirSync(dataPath);
      return { success: true, files };
    } catch (error) {
      console.error('Error listing files:', error);
      return { success: false, error: error.message };
    }
  });
}

app.whenReady().then(() => {
  setupIPC();
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (process.platform !== 'darwin') app.quit();
});
