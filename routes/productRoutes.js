import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import {
  getProducts,
  getProduct,
  getProductByPart,
  addProduct,
  editProduct,
  removeProduct,
  importProducts,
  getFields,
  addField,
  removeField,
  downloadImportTemplate,
  getProductOptions,
  uploadPartImage,
} from '../controllers/productController.js';
import { authenticateToken, requireRole } from '../middleware/auth.js';

const upload = multer({ storage: multer.memoryStorage() });

const imageStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const dir = path.resolve('uploads/part_images');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.png';
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${base}_${Date.now()}${ext}`);
  },
});

const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('Only image files (PNG, JPG, JPEG, WEBP) are allowed'));
    }
    cb(null, true);
  },
});

const router = express.Router();

router.use(authenticateToken);

// Part image upload
router.post('/upload-image', requireRole(['admin', 'QA HOD']), uploadImage.single('image'), uploadPartImage);

// Field Management
router.get('/fields', getFields);
router.post('/fields', requireRole(['admin', 'QA HOD']), addField);
router.delete('/fields/:key', requireRole(['admin', 'QA HOD']), removeField);

// Dropdown options
router.get('/options', getProductOptions);
router.get('/dropdown/options', getProductOptions);

// Excel template & import
router.get('/download-template', downloadImportTemplate);
router.post('/import', requireRole(['admin', 'QA HOD']), upload.single('file'), importProducts);

// Products CRUD
router.get('/', getProducts);
router.get('/by-part/:partNumber', getProductByPart);
router.get('/:id', getProduct);
router.post('/', requireRole(['admin', 'QA HOD']), addProduct);
router.put('/:id', requireRole(['admin', 'QA HOD']), editProduct);
router.delete('/:id', requireRole(['admin', 'QA HOD']), removeProduct);

export default router;
