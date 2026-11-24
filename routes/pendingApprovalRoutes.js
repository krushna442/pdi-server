import express from 'express';
import {
  getApprovals,
  getApproval,
  approve,
  reject,
} from '../controllers/pendingApprovalController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/', getApprovals);
router.get('/:id', getApproval);
router.post('/:id/approve', requireRole(['admin', 'QA HOD']), approve);
router.post('/:id/reject', requireRole(['admin', 'QA HOD']), reject);

export default router;
