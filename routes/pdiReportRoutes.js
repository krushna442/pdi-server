import express from 'express';
import { getPartReport, exportPdiExcel, exportManualPdiExcel, sendManualPdiEmail } from '../controllers/pdiReportController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

router.post('/pdi-part', getPartReport);
router.post('/export-excel', exportPdiExcel);
router.post('/export-manual-excel', exportManualPdiExcel);
router.post('/send-manual-email', sendManualPdiEmail);

export default router;
