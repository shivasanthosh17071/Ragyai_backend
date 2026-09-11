import { env } from '../config/env.js';
import asyncHandler from '../utils/asyncHandler.js';
import { sendSuccess } from '../utils/apiResponse.js';
import sendEmail from '../utils/sendEmail.js';

export const submitContact = asyncHandler(async (req, res) => {
  const { name, email, message } = req.body;

  await sendEmail({
    to: env.mail.adminAlert,
    subject: `New contact message from ${name}`,
    html: `<p><b>From:</b> ${name} (${email})</p><p>${message.replace(/\n/g, '<br>')}</p>`,
  });

  return sendSuccess(res, { message: "Thanks — we'll get back to you within a day." });
});
