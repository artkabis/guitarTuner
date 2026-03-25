import { WooCommerceExporter } from '../exporters/WooCommerceExporter';
import { prisma } from '../db/prisma';

const exporter = new WooCommerceExporter();

export class ExportService {
  async createJob(productIds: string[], connectionId: string) {
    return prisma.exportJob.create({
      data: {
        productIds,
        connectionId,
        total: productIds.length,
        status: 'PENDING',
      },
    });
  }

  async runJob(jobId: string) {
    const job = await prisma.exportJob.findUniqueOrThrow({ where: { id: jobId } });

    await prisma.exportJob.update({ where: { id: jobId }, data: { status: 'RUNNING' } });

    const products = await prisma.product.findMany({
      where: { id: { in: job.productIds } },
      include: { images: true },
    });

    const results = await exporter.exportProducts(products, job.connectionId, jobId);
    const failed = results.filter(r => !r.success);
    const succeeded = results.filter(r => r.success);

    await prisma.exportJob.update({
      where: { id: jobId },
      data: {
        status: failed.length === results.length ? 'ERROR' : 'DONE',
        exported: succeeded.length,
        errors: failed,
      },
    });

    if (succeeded.length > 0) {
      await prisma.product.updateMany({
        where: { id: { in: succeeded.map(r => r.productId) } },
        data: { status: 'PUBLISHED' },
      });
    }

    return results;
  }
}
