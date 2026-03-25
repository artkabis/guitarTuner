import { Router } from 'express';
import { prisma } from '../db/prisma';

const router = Router();

// GET /api/mappings
router.get('/', async (_req, res) => {
  try {
    res.json(await prisma.csvMappingPreset.findMany({ orderBy: { createdAt: 'desc' } }));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/mappings
router.post('/', async (req, res) => {
  try {
    const { name, mapping } = req.body as { name: string; mapping: Record<string, string> };
    if (!name || !mapping) {
      res.status(400).json({ error: 'name and mapping are required' });
      return;
    }
    res.json(await prisma.csvMappingPreset.create({ data: { name, mapping } }));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/mappings/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.csvMappingPreset.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export { router as mappingsRouter };
