import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import {
  createManualPdiDocument,
  findAllManualPdiDocuments,
  findManualPdiById,
} from '../models/manualPdiModel.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UPLOAD_DIR = path.resolve(__dirname, '../uploads/pdi-manual');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

export async function listManualPdi(req, res) {
  try {
    const userRole = req.user?.role;

    // QA LINE is the base level user and can ONLY upload, cannot view the uploaded list
    if (userRole === 'QA LINE') {
      return res.json({ success: true, data: [] });
    }

    const docs = await findAllManualPdiDocuments();
    return res.json({ success: true, data: docs });
  } catch (err) {
    console.error('listManualPdi error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function uploadManualPdi(req, res) {
  try {
    const part_number = (req.body.part_number || '').trim().toUpperCase();
    const name = (req.body.name || req.user?.name || req.user?.username || 'Quality Inspector').trim();

    if (!part_number) {
      return res.status(400).json({ success: false, message: 'Part Number is required before uploading a document' });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'File is required' });
    }

    // Relative web-accessible path
    const filePath = `uploads/pdi-manual/${req.file.filename}`;

    const record = await createManualPdiDocument({
      part_number,
      name,
      file_path: filePath,
      user_id: req.user?.id || null,
      role: req.user?.role || 'QA LINE',
    });

    return res.status(201).json({
      success: true,
      message: 'Document uploaded successfully',
      data: record,
    });
  } catch (err) {
    console.error('uploadManualPdi error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}
