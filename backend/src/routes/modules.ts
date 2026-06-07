import fs from 'fs';
import path from 'path';
import os from 'os';
import { Router, RequestHandler } from 'express';
import multer from 'multer';
import unzipper from 'unzipper';
import { config } from '../config';
import { listModules, loadAllModules, getModule } from '../modules/loader';

export const modulesRouter = Router();
const upload = multer({ dest: os.tmpdir(), limits: { fileSize: 5 * 1024 * 1024 } });

modulesRouter.get('/', (_req, res) => {
  res.json(listModules());
});

modulesRouter.get('/:id', (req, res) => {
  const mod = getModule(req.params.id);
  if (!mod) {
    res.status(404).json({ error: 'module not found' });
    return;
  }
  res.json(mod.manifest);
});

// Import a custom module packaged as a .zip containing module.json + run.js.
// The archive is extracted into modules/<id> and hot-loaded by the watcher.
// multer ships its own (older) express types; cast to our express RequestHandler
// to avoid the duplicate-@types/express structural mismatch at the router seam.
const uploadModule = upload.single('module') as unknown as RequestHandler;

modulesRouter.post('/import', uploadModule, async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'no file uploaded (field name: module)' });
    return;
  }
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bv-mod-'));
  try {
    await fs
      .createReadStream(req.file.path)
      .pipe(unzipper.Extract({ path: tmpDir }))
      .promise();

    // Locate the directory that actually holds module.json (allow a wrapping folder).
    const manifestPath = findManifest(tmpDir);
    if (!manifestPath) {
      res.status(400).json({ error: 'zip does not contain a module.json' });
      return;
    }
    const srcDir = path.dirname(manifestPath);
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (!manifest.id || !/^[a-z0-9-]+$/i.test(manifest.id)) {
      res.status(400).json({ error: 'module.json must have a simple alphanumeric id' });
      return;
    }
    const destDir = path.join(config.modulesDir, manifest.id);
    fs.rmSync(destDir, { recursive: true, force: true });
    fs.cpSync(srcDir, destDir, { recursive: true });
    loadAllModules();
    res.json({ ok: true, id: manifest.id, manifest: getModule(manifest.id)?.manifest });
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  } finally {
    fs.rmSync(req.file.path, { force: true });
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

function findManifest(dir: string): string | null {
  const direct = path.join(dir, 'module.json');
  if (fs.existsSync(direct)) return direct;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const nested = path.join(dir, entry.name, 'module.json');
      if (fs.existsSync(nested)) return nested;
    }
  }
  return null;
}
