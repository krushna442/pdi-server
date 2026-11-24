import express from 'express';
import { getPartReport, exportPdiExcel } from '../controllers/pdiReportController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

router.post('/pdi-part', getPartReport);
router.post('/export-excel', exportPdiExcel);

export default router;
