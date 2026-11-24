import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  pool: true,
  maxConnections: 2,
  rateDelta: 5000,
  rateLimit: 3,
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASSWORD,
  },
});

export async function sendMail({ to, subject, html, text, attachments = [] }) {
  if (!process.env.MAIL_USER || !process.env.MAIL_PASSWORD) {
    console.warn('[Mailer] Mail credentials not set in .env. Skipping email dispatch.');
    return { success: false, message: 'SMTP credentials missing' };
  }

  const recipients = Array.isArray(to) ? to.join(', ') : to;
  if (!recipients) {
    console.warn('[Mailer] No recipients supplied.');
    return { success: false, message: 'No recipients' };
  }

  const mailOptions = {
    from: `"RSB PDI Quality System" <${process.env.MAIL_USER}>`,
    to: recipients,
    subject,
    text,
    html,
    attachments,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log(`[Mailer] Email sent successfully to ${recipients}. MessageId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error('[Mailer] Email failed to send:', err.message);
    throw err;
  }
}
