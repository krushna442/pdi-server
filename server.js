import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

import { initUsersTable } from './models/userModel.js';
import { initProductsTable } from './models/productModel.js';
import { initScannedProductsTable } from './models/scannedProductModel.js';
import { initPdiTemplatesTable } from './models/pdiTemplateModel.js';
import { initPendingApprovalsTable } from './models/pendingApprovalModel.js';
import { initDynamicFieldsTable } from './models/dynamicFieldModel.js';
import { initManualPdiTable } from './models/manualPdiModel.js';
import { initShiftCronJobs } from './utils/shiftReportCron.js';

import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import productRoutes from './routes/productRoutes.js';
import scannedProductRoutes from './routes/scannedProductRoutes.js';
import pdiTemplateRoutes from './routes/pdiTemplateRoutes.js';
import pendingApprovalRoutes from './routes/pendingApprovalRoutes.js';
import pdiReportRoutes from './routes/pdiReportRoutes.js';
import manualPdiRoutes from './routes/manualPdiRoutes.js';
import dynamicFieldRoutes from './routes/dynamicFieldRoutes.js';
import settingsRoutes from './routes/settingsRoutes.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static uploads folder if needed
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/products', productRoutes);
app.use('/api/scanned-products', scannedProductRoutes);
app.use('/api/pdi-templates', pdiTemplateRoutes);
app.use('/api/pending-approvals', pendingApprovalRoutes);
app.use('/api/reports', pdiReportRoutes);
app.use('/api/pdi-manual', manualPdiRoutes);
app.use('/api/dynamic-fields', dynamicFieldRoutes);
app.use('/api/settings', settingsRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'online',
    system: 'RSB PDI Quality Management System',
    timestamp: new Date().toISOString(),
  });
});

// Bootstrap database tables & cron jobs
async function startServer() {
  try {
    console.log('[Server] Initializing database tables...');
    await initUsersTable();
    await initProductsTable();
    await initScannedProductsTable();
    await initPdiTemplatesTable();
    await initPendingApprovalsTable();
    await initDynamicFieldsTable();
    await initManualPdiTable();

    console.log('[Server] Initializing shift cron scheduler...');
    initShiftCronJobs();

    app.listen(PORT, () => {
      console.log(`🚀 RSB PDI Server running on port ${PORT}`);
      console.log(`📡 Health Check: http://localhost:${PORT}/api/health`);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

startServer();
