import express from 'express';
import {
  getSettings,
  saveShiftSettings,
  testEmail,
  triggerShiftCronManual,
} from '../controllers/settingsController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/', getSettings);
router.post('/shifts', requireRole(['admin']), saveShiftSettings);
router.post('/test-email', requireRole(['admin', 'QA HOD']), testEmail);
router.post('/trigger-shift-report', requireRole(['admin', 'QA HOD']), triggerShiftCronManual);

export default router;
