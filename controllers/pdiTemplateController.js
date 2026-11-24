import {
  findAllTemplates,
  findTemplateByPartNumber,
  findTemplateById,
  saveTemplate,
  deleteTemplate,
  parsePdiExcelBuffer,
} from '../models/pdiTemplateModel.js';
import { createPendingApproval } from '../models/pendingApprovalModel.js';

export async function getTemplates(req, res) {
  try {
    const templates = await findAllTemplates();
    return res.json({ success: true, data: templates });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function getTemplateByPart(req, res) {
  try {
    const template = await findTemplateByPartNumber(req.params.partNumber);
    if (!template) {
      return res.status(404).json({ success: false, message: `No PDI template found for part ${req.params.partNumber}` });
    }
    return res.json({ success: true, data: template });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function getTemplate(req, res) {
  try {
    const template = await findTemplateById(req.params.id);
    if (!template) return res.status(404).json({ success: false, message: 'Template not found' });
    return res.json({ success: true, data: template });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function createOrUpdateTemplate(req, res) {
  try {
    const {
      part_number,
      description,
      vendor_code,
      customer,
      draw_rev_no,
      format_no,
      issue_date,
      rev_no,
      rev_date,
      rows,
    } = req.body;

    if (!part_number) {
      return res.status(400).json({ success: false, message: 'Part Number is required' });
    }

    const userRole = req.user?.role || 'QA LINE';
    const userName = req.user?.name || req.user?.username || 'User';

    // QA LINE cannot edit templates
    if (userRole === 'QA LINE') {
      return res.status(403).json({
        success: false,
        message: 'QA LINE role does not have permission to modify PDI templates',
      });
    }

    const existing = await findTemplateByPartNumber(part_number);

    // APPROVAL WORKFLOW:
    // If QA INCHARGE updates/creates a template, it MUST go to pending approvals!
    if (userRole === 'QA INCHARGE') {
      const pending = await createPendingApproval({
        category: 'pdi_template',
        record_id: existing?.id || part_number,
        record_identifier: `PDI Template for Part ${part_number}`,
        current_values: existing || {},
        proposed_values: {
          part_number,
          description,
          vendor_code,
          customer,
          draw_rev_no,
          format_no,
          issue_date,
          rev_no,
          rev_date,
          rows: rows || [],
        },
        changed_fields: ['rows', 'description', 'draw_rev_no', 'rev_no'],
        requested_by: userName,
        requested_by_role: userRole,
      });

      return res.json({
        success: true,
        pending_approval: true,
        data: pending,
        message: 'Template update submitted for approval by QA HOD or Admin',
      });
    }

    // Admin & QA HOD save directly
    const saved = await saveTemplate({
      part_number,
      description,
      vendor_code,
      customer,
      draw_rev_no,
      format_no,
      issue_date,
      rev_no,
      rev_date,
      rows: rows || [],
      updated_by: userName,
    });

    return res.json({
      success: true,
      pending_approval: false,
      data: saved,
      message: 'PDI Template saved successfully',
    });
  } catch (err) {
    console.error('Template save error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function removeTemplate(req, res) {
  try {
    const userRole = req.user?.role;
    if (userRole !== 'admin' && userRole !== 'QA HOD') {
      return res.status(403).json({ success: false, message: 'Only Admin or QA HOD can delete templates' });
    }

    await deleteTemplate(req.params.id);
    return res.json({ success: true, message: 'Template deleted successfully' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

/**
 * Upload and parse Excel PDI template
 */
export async function uploadExcel(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Excel file required' });
    }

    const parsedData = parsePdiExcelBuffer(req.file.buffer);

    if (!parsedData.part_number && req.body.part_number) {
      parsedData.part_number = req.body.part_number;
    }

    // If auto_save flag is true and user is admin or QA HOD, save directly
    if (req.body.auto_save === 'true' && parsedData.part_number) {
      const userRole = req.user?.role;
      const userName = req.user?.name || req.user?.username || 'User';

      if (userRole === 'QA INCHARGE') {
        const existing = await findTemplateByPartNumber(parsedData.part_number);
        const pending = await createPendingApproval({
          category: 'pdi_template',
          record_id: existing?.id || parsedData.part_number,
          record_identifier: `PDI Template Upload for Part ${parsedData.part_number}`,
          current_values: existing || {},
          proposed_values: parsedData,
          changed_fields: ['rows_imported_from_excel'],
          requested_by: userName,
          requested_by_role: userRole,
        });

        return res.json({
          success: true,
          pending_approval: true,
          data: pending,
          message: 'Excel template submitted for approval by QA HOD or Admin',
        });
      }

      const saved = await saveTemplate({
        ...parsedData,
        updated_by: userName,
      });

      return res.json({
        success: true,
        data: saved,
        message: `Template for Part ${parsedData.part_number} uploaded and saved successfully`,
      });
    }

    // Return parsed data to client for preview / edit
    return res.json({
      success: true,
      data: parsedData,
      message: 'Excel parsed successfully. Please review and save.',
    });
  } catch (err) {
    console.error('Excel upload error:', err);
    return res.status(500).json({ success: false, message: err.message });
  }
}
