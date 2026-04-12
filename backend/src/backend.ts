import express, { Request, Response, Application } from 'express';
import { body, validationResult } from 'express-validator';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const backendFolder = '../data';
const app: Application = express();

app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

const PORT = 8001;

const api = express.Router(); 


// your routes below this line ------------

interface FileUpload {
  filename: string;
  content: string;  // base64 or text content
  encoding: 'base64' | 'utf8';
}

interface UploadRequest {
  sessionId: string;
  _uploadId?: string;
  files: FileUpload[];
}

async function getUniqueDirName(base: string): Promise<string> {
  let candidate = base;
  let counter = 0;
  while (true) {
    try {
      await fs.access(path.join(backendFolder, candidate));
      counter++;
      candidate = `${base}_${counter}`;
    } catch {
      return candidate;
    }
  }
}

api.post(
  '/data',
  body('sessionId').isString(),
  body('files').isArray(),
  body('files.*.filename').isString(),
  body('files.*.content').isString(),
  body('files.*.encoding').isIn(['base64', 'utf8']),
  async (req: Request, res: Response) => {
    try {
      const result = validationResult(req);
      if (!result.isEmpty()) {
        return res.status(400).json({ errors: result.array() });
      }

      const data = req.body as UploadRequest;
      let targetDir = data.sessionId;

      // If _uploadId differs from sessionId and its folder exists, rename it
      if (data._uploadId && data._uploadId !== data.sessionId) {
        const uploadIdDir = path.join(backendFolder, data._uploadId);
        try {
          await fs.access(uploadIdDir);
          // Folder from eager uploads exists; rename to final sessionId with collision avoidance
          const uniqueName = await getUniqueDirName(data.sessionId);
          await fs.rename(uploadIdDir, path.join(backendFolder, uniqueName));
          targetDir = uniqueName;
        } catch {
          // No eager upload folder — use sessionId directly with collision avoidance
          targetDir = await getUniqueDirName(data.sessionId);
        }
      }

      const dataDir = path.join(backendFolder, targetDir);
      await fs.mkdir(dataDir, { recursive: true });

      const savePromises = data.files.map(async (file) => {
        const filePath = path.join(dataDir, file.filename);
        if (file.encoding === 'base64') {
          const buffer = Buffer.from(file.content, 'base64');
          await fs.writeFile(filePath, new Uint8Array(buffer));
        } else {
          await fs.writeFile(filePath, file.content, 'utf8');
        }
      });

      await Promise.all(savePromises);

      return res.status(200).json({
        status: 200,
        message: 'Files saved successfully'
      });
    } catch (error) {
      console.error('Error saving files:', error);
      return res.status(500).json({
        status: 500,
        message: 'Error saving files'
      });
    }
  }
);




// --------- 

app.use('/backend', api);

if (process.env.NODE_ENV === 'production') {
  const distPath = path.join(__dirname, '../static');
  app.use(express.static(distPath));
  
  // Serve index.html for all non-API routes (for client-side routing)
  app.get('*', (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, () => {
  console.log(`REACTIVE_BACKEND_READY`);
  console.log(`Server is Fire at http://localhost:${PORT}`);
});
