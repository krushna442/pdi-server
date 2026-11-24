import { getConfig, updateConfig } from '../models/dynamicFieldModel.js';
import { runShiftReporting } from '../utils/shiftReportCron.js';
import { sendMail } from '../utils/mailer.js';

export async function getSettings(req, res) {
  try {
    const config = await getConfig();
    return res.json({
      success: true,
      data: {
        shifts: config.shift_settings,
        smtpConfigured: Boolean(process.env.MAIL_USER && process.env.MAIL_PASSWORD),
        mailUser: process.env.MAIL_USER ? process.env.MAIL_USER.replace(/(.{3})(.*)(@.*)/, '$1***$3') : 'Not Configured',
      },
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function saveShiftSettings(req, res) {
  try {
    const { shifts } = req.body;
    if (!Array.isArray(shifts)) {
      return res.status(400).json({ success: false, message: 'shifts must be an array' });
    }
    const updated = await updateConfig({ shift_settings: shifts });
    return res.json({ success: true, data: updated.shift_settings, message: 'Shift settings updated' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function testEmail(req, res) {
  try {
    const recipient = req.body.email || req.user?.email || process.env.MAIL_USER;
    if (!recipient) {
      return res.status(400).json({ success: false, message: 'Recipient email required' });
    }

    await sendMail({
      to: recipient,
      subject: 'RSB PDI Quality System — Test Email',
      html: `
        <div style="font-family: Arial, sans-serif; padding: 20px; border: 1px solid #cbd5e1; border-radius: 6px;">
          <h2 style="color: #0d9488;">SMTP Test Successful</h2>
          <p>This is a verification email from RSB PDI Management System.</p>
          <p>Timestamp: ${new Date().toLocaleString('en-IN')}</p>
        </div>
      `,
    });

    return res.json({ success: true, message: `Test email sent successfully to ${recipient}` });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function triggerShiftCronManual(req, res) {
  try {
    const { shift = 'A', date } = req.body;
    const result = await runShiftReporting(shift, date ? new Date(date) : null);
    return res.json({
      success: true,
      result,
      message: `Shift ${shift} report generated and dispatched successfully!`,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
}
