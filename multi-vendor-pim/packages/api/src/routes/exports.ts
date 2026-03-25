import { Router } from 'express';
import { ExportService } from '../services/ExportService';
import { prisma } from '../db/prisma';

const router = Router();
const exportService = new ExportService();

// POST /api/exports
// Start an async export job
router.post('/', async (req, res) => {
  try {
    const { productIds, connectionId } = req.body as {
      productIds: string[];
      connectionId: string;
    };
    if (!productIds?.length || !connectionId) {
      res.status(400).json({ error: 'productIds and connectionId are required' });
      return;
    }
    const job = await exportService.createJob(productIds, connectionId);
    // Fire and forget — client polls GET /api/exports/:id for progress
    exportService.runJob(job.id).catch(err => {
      console.error(`Export job ${job.id} failed:`, err);
    });
    res.json({ jobId: job.id, status: 'PENDING' });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/exports/:id
router.get('/:id', async (req, res) => {
  try {
    const job = await prisma.exportJob.findUniqueOrThrow({
      where: { id: req.params.id },
    });
    res.json(job);
  } catch {
    res.status(404).json({ error: 'Export job not found' });
  }
});

export { router as exportsRouter };
