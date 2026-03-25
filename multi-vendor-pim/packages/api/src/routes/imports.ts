import { Router } from 'express';
import multer from 'multer';
import { CsvAdapter } from '../adapters/CsvAdapter';
import { ImportService } from '../services/ImportService';
import { prisma } from '../db/prisma';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
  fileFilter: (_req, file, cb) => {
    cb(null, file.mimetype === 'text/csv' || file.originalname.endsWith('.csv'));
  },
});
const csv = new CsvAdapter();
const importService = new ImportService();

// POST /api/imports/upload
// Upload a CSV file → returns session ID, headers, preview rows, mapping suggestions
router.post('/upload', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No CSV file uploaded' });
      return;
    }
    const content = req.file.buffer.toString('utf-8');
    const headers = csv.parseHeaders(content);
    const preview = csv.parsePreview(content, 5);
    const suggestions = csv.suggestMapping(headers);
    const session = await importService.createSession(req.file.originalname, content);
    res.json({
      sessionId: session.id,
      headers,
      preview,
      suggestions,
      rowCount: session.rowCount,
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/imports/:id/preview
// Apply mapping to first N rows, return transformed products
router.post('/:id/preview', async (req, res) => {
  try {
    const preview = await importService.previewWithMapping(
      req.params.id,
      req.body.mapping,
    );
    res.json(preview);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/imports/:id/execute
// Run the full import; products created with DRAFT status
router.post('/:id/execute', async (req, res) => {
  try {
    const result = await importService.executeImport(
      req.params.id,
      req.body.mapping,
      req.body.presetId,
    );
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/imports/:id
router.get('/:id', async (req, res) => {
  try {
    const session = await prisma.importSession.findUniqueOrThrow({
      where: { id: req.params.id },
    });
    res.json(session);
  } catch {
    res.status(404).json({ error: 'Session not found' });
  }
});

export { router as importsRouter };
