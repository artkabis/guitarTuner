import { Router } from 'express';
import { prisma } from '../db/prisma';
import { EncryptionService } from '../services/EncryptionService';

const router = Router();
const enc = new EncryptionService();

const mask = (c: object) => ({ ...c, consumerKey: '***', consumerSecret: '***' });

// GET /api/connections
router.get('/', async (_req, res) => {
  try {
    const connections = await prisma.wooCommerceConnection.findMany({
      orderBy: { createdAt: 'desc' },
    });
    res.json(connections.map(mask));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/connections
router.post('/', async (req, res) => {
  try {
    const { name, url, consumerKey, consumerSecret } = req.body as {
      name: string;
      url: string;
      consumerKey: string;
      consumerSecret: string;
    };
    if (!name || !url || !consumerKey || !consumerSecret) {
      res.status(400).json({ error: 'name, url, consumerKey, consumerSecret are required' });
      return;
    }
    const connection = await prisma.wooCommerceConnection.create({
      data: {
        name,
        url: url.replace(/\/$/, ''),
        consumerKey: enc.encrypt(consumerKey),
        consumerSecret: enc.encrypt(consumerSecret),
      },
    });
    res.json(mask(connection));
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/connections/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.wooCommerceConnection.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export { router as connectionsRouter };
