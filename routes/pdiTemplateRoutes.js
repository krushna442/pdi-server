import express from 'express';
import multer from 'multer';
import {
  getTemplates,
  getTemplateByPart,
  getTemplate,
  createOrUpdateTemplate,
  removeTemplate,
  uploadExcel,
} from '../controllers/pdiTemplateController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const upload = multer({ storage: multer.memoryStorage() });
const router = express.Router();

router.use(authenticateToken);

router.get('/', getTemplates);
router.get('/by-part/:partNumber', getTemplateByPart);
router.get('/:id', getTemplate);

// Modified by admin, QA HOD directly, but QA INCHARGE creates a pending approval
router.post('/', requireRole(['admin', 'QA HOD', 'QA INCHARGE']), createOrUpdateTemplate);
router.put('/', requireRole(['admin', 'QA HOD', 'QA INCHARGE']), createOrUpdateTemplate);
router.delete('/:id', requireRole(['admin', 'QA HOD']), removeTemplate);
router.post('/upload-excel', requireRole(['admin', 'QA HOD', 'QA INCHARGE']), upload.single('file'), uploadExcel);

export default router;
