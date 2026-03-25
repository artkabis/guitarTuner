import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { productsRouter } from './routes/products';
import { importsRouter } from './routes/imports';
import { connectionsRouter } from './routes/connections';
import { mappingsRouter } from './routes/mappings';
import { exportsRouter } from './routes/exports';

const app = express();
const PORT = process.env.PORT ?? 3001;

app.use(cors({ origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173' }));
app.use(express.json({ limit: '1mb' }));

app.use('/api/products', productsRouter);
app.use('/api/imports', importsRouter);
app.use('/api/connections', connectionsRouter);
app.use('/api/mappings', mappingsRouter);
app.use('/api/exports', exportsRouter);

app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

app.listen(PORT, () => {
  console.log(`API running on http://localhost:${PORT}`);
});
