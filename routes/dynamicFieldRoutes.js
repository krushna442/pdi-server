import express from 'express';
import { getDynamicFields, saveDynamicFields } from '../controllers/dynamicFieldController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const router = express.Router();

router.use(authenticateToken);

router.get('/', getDynamicFields);
router.post('/', requireRole(['admin', 'QA HOD']), saveDynamicFields);

export default router;
