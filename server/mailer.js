// mailer.js
// Sends OTP emails using Gmail + an "App Password".
//
// SETUP (one-time, takes 5 minutes):
// 1. Use a Gmail account (create a fresh one for this app, e.g. yourquiz.app@gmail.com)
// 2. Turn on 2-Step Verification: https://myaccount.google.com/security
// 3. Create an App Password: https://myaccount.google.com/apppasswords
//    - Select "Mail" as the app, generate, copy the 16-character password
// 4. Put the gmail address and that 16-char password into server/.env (see .env.example)
//
// This sends real emails immediately, no business verification needed,
// and the free Gmail sending limit (~500/day) is far more than one class needs weekly.

const nodemailer = require('nodemailer');

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD,
    },
  });
  return transporter;
}

async function sendOtpEmail(toEmail, code, purpose) {
  // In local/dev mode without real Gmail credentials configured,
  // log the OTP to the console instead of failing, so you can still test the flow.
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
    console.log(`[DEV MODE - no email configured] OTP for ${toEmail}: ${code}`);
    return { devMode: true };
  }

  const t = getTransporter();
  const subject = purpose === 'teacher' ? 'Your Teacher Login OTP' : 'Your Student Login OTP';

  await t.sendMail({
    from: `"Weekly Quiz" <${process.env.GMAIL_USER}>`,
    to: toEmail,
    subject,
    text: `Your OTP code is: ${code}\n\nThis code expires in 10 minutes. If you did not request this, ignore this email.`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color:#1a1a2e;">Your Login Code</h2>
        <p>Use this code to log in:</p>
        <p style="font-size: 32px; font-weight: bold; letter-spacing: 4px; color: #4338ca;">${code}</p>
        <p style="color:#666; font-size: 14px;">This code expires in 10 minutes. If you did not request this, you can safely ignore this email.</p>
      </div>
    `,
  });

  return { devMode: false };
}

module.exports = { sendOtpEmail };
