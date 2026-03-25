import { Router } from 'express';
import { prisma } from '../db/prisma';
import type { ProductStatus } from '@prisma/client';

const router = Router();

// GET /api/products?status=DRAFT&search=foo&page=1&limit=50
router.get('/', async (req, res) => {
  try {
    const { status, search, page = '1', limit = '50' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where: Record<string, unknown> = {};
    if (status) where.status = status as ProductStatus;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { sku: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [products, total] = await Promise.all([
      prisma.product.findMany({
        where,
        skip,
        take: parseInt(limit),
        orderBy: { updatedAt: 'desc' },
        include: { images: true },
      }),
      prisma.product.count({ where }),
    ]);

    res.json({ products, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// GET /api/products/:id
router.get('/:id', async (req, res) => {
  try {
    const product = await prisma.product.findUniqueOrThrow({
      where: { id: req.params.id },
      include: { images: true },
    });
    res.json(product);
  } catch {
    res.status(404).json({ error: 'Product not found' });
  }
});

// PATCH /api/products/:id
router.patch('/:id', async (req, res) => {
  try {
    const { images: _images, id: _id, createdAt: _c, updatedAt: _u, ...data } = req.body;
    const product = await prisma.product.update({
      where: { id: req.params.id },
      data,
      include: { images: true },
    });
    res.json(product);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// POST /api/products/bulk-status
router.post('/bulk-status', async (req, res) => {
  try {
    const { ids, status } = req.body as { ids: string[]; status: ProductStatus };
    if (!ids?.length) {
      res.status(400).json({ error: 'ids is required' });
      return;
    }
    await prisma.product.updateMany({
      where: { id: { in: ids } },
      data: { status },
    });
    res.json({ updated: ids.length });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

// DELETE /api/products/:id
router.delete('/:id', async (req, res) => {
  try {
    await prisma.product.delete({ where: { id: req.params.id } });
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export { router as productsRouter };
