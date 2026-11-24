import express from 'express';
import {
  createScan,
  parseLabel,
  getScansList,
  getCurrentShift,
  getDashboard,
} from '../controllers/scannedProductController.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

router.post('/scan', createScan);
router.post('/parse-label', parseLabel);
router.get('/', getScansList);
router.get('/current-shift', getCurrentShift);
router.get('/dashboard-stats', getDashboard);

export default router;
