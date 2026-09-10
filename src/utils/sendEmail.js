import nodemailer from 'nodemailer';
import { env } from '../config/env.js';

let transporter = null;

const getTransporter = () => {
  if (!env.mail.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.mail.host,
      port: env.mail.port,
      secure: env.mail.port === 465,
      auth: env.mail.user ? { user: env.mail.user, pass: env.mail.pass } : undefined,
    });
  }
  return transporter;
};

/** Never throws — a failed notification must not fail the order it belongs to. */
export const sendEmail = async ({ to, subject, html, text }) => {
  try {
    const tx = getTransporter();
    if (!tx) {
      console.log(`[email:dev] to=${to} subject="${subject}"`);
      return { queued: false, dev: true };
    }
    const info = await tx.sendMail({ from: env.mail.from, to, subject, html, text });
    return { queued: true, messageId: info.messageId };
  } catch (err) {
    console.error('[email:error]', err.message);
    return { queued: false, error: err.message };
  }
};

export default sendEmail;
