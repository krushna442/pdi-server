import {
  findAllPendingApprovals,
  findApprovalById,
  approvePendingRequest,
  rejectPendingRequest,
} from '../models/pendingApprovalModel.js';

export async function getApprovals(req, res) {
  try {
    const { status } = req.query;
    const items = await findAllPendingApprovals({ status });
    return res.json({ success: true, data: items });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function getApproval(req, res) {
  try {
    const item = await findApprovalById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Approval request not found' });
    return res.json({ success: true, data: item });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function approve(req, res) {
  try {
    const userRole = req.user?.role;
    if (userRole !== 'admin' && userRole !== 'QA HOD') {
      return res.status(403).json({
        success: false,
        message: 'Only Admin or QA HOD can approve template modifications',
      });
    }

    const reviewer = req.user?.name || req.user?.username || 'Approver';
    const result = await approvePendingRequest(req.params.id, reviewer);

    return res.json({
      success: true,
      data: result,
      message: 'Template changes approved and committed to active templates',
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function reject(req, res) {
  try {
    const userRole = req.user?.role;
    if (userRole !== 'admin' && userRole !== 'QA HOD') {
      return res.status(403).json({
        success: false,
        message: 'Only Admin or QA HOD can reject template modifications',
      });
    }

    const { rejection_reason } = req.body;
    const reviewer = req.user?.name || req.user?.username || 'Approver';
    const result = await rejectPendingRequest(req.params.id, reviewer, rejection_reason);

    return res.json({
      success: true,
      data: result,
      message: 'Template changes rejected',
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}
