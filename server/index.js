// index.js
const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');
const ExcelJS = require('exceljs');

const dotenvPath = path.join(__dirname, '.env');
if (fs.existsSync(dotenvPath) && process.env.NODE_ENV !== 'production') {
  require('dotenv').config({ path: dotenvPath });
}

const { initDb } = require('./db');
const { sendOtpEmail } = require('./mailer');
const { seededShuffle } = require('./shuffle');
const {
  generateOtp,
  createToken,
  requireStudent,
  requireTeacher,
  OTP_EXPIRY_MS,
  uuidv4,
} = require('./auth');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

// Comma-separated list of teacher emails allowed to log in as teacher.
// Set this in server/.env, e.g. TEACHER_EMAILS=sir@college.edu,hod@college.edu
const TEACHER_EMAILS = (process.env.TEACHER_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

let db;

function normalizeQuizQuestion(question, fallbackTimeLimit = 72) {
  if (typeof question === 'string') {
    return { text: question.trim(), options: [], timeLimitSec: fallbackTimeLimit };
  }

  const text = String(question?.text ?? '').trim();
  const options = Array.isArray(question?.options)
    ? question.options
        .map((opt) => String(opt ?? '').trim())
        .filter(Boolean)
        .slice(0, 4)
    : [];

  return {
    text,
    options,
    timeLimitSec: Number.isFinite(Number(question?.timeLimitSec)) ? Number(question.timeLimitSec) : fallbackTimeLimit,
  };
}

// ---------- OTP: request ----------
// Used by both student and teacher login screens.
app.post('/api/otp/request', async (req, res) => {
  const { email, role } = req.body;
  if (!email || !role) return res.status(400).json({ error: 'Email and role are required' });
  const normalizedEmail = String(email).trim().toLowerCase();

  if (role === 'teacher' && !TEACHER_EMAILS.includes(normalizedEmail)) {
    return res.status(403).json({ error: 'This email is not registered as a teacher account' });
  }

  const code = generateOtp();
  const expiresAt = Date.now() + OTP_EXPIRY_MS;

  await db.read();
  // remove any previous unconsumed OTPs for this email+role to avoid clutter
  db.data.otps = db.data.otps.filter((o) => !(o.email === normalizedEmail && o.role === role));
  db.data.otps.push({ id: uuidv4(), email: normalizedEmail, code, role, expiresAt, used: false });
  await db.write();

  try {
    await sendOtpEmail(normalizedEmail, code, role);
    res.json({ ok: true, message: 'OTP sent to email' });
  } catch (err) {
    console.error('Failed to send OTP email:', err.message);
    console.log(`[OTP FALLBACK] OTP for ${normalizedEmail} (${role}): ${code}`);
    res.json({ ok: true, message: 'OTP generated, but email delivery failed. Check server logs for the code.' });
  }
});

// ---------- OTP: verify ----------
app.post('/api/otp/verify', async (req, res) => {
  const { email, role, code, name } = req.body;
  if (!email || !role || !code) return res.status(400).json({ error: 'Missing fields' });
  const normalizedEmail = String(email).trim().toLowerCase();

  await db.read();
  const otpRecord = db.data.otps.find(
    (o) => o.email === normalizedEmail && o.role === role && !o.used
  );

  if (!otpRecord) return res.status(400).json({ error: 'No OTP requested for this email. Please request a new one.' });
  if (otpRecord.code !== String(code).trim()) return res.status(400).json({ error: 'Incorrect OTP' });
  if (Date.now() > otpRecord.expiresAt) return res.status(400).json({ error: 'OTP expired. Please request a new one.' });

  otpRecord.used = true;

  let userId;
  if (role === 'student') {
    let student = db.data.students.find((s) => s.email === normalizedEmail);
    if (!student) {
      student = { id: uuidv4(), email: normalizedEmail, name: name || normalizedEmail, createdAt: Date.now() };
      db.data.students.push(student);
    }
    userId = student.id;
  } else {
    let teacher = db.data.teachers.find((t) => t.email === normalizedEmail);
    if (!teacher) {
      teacher = { id: uuidv4(), email: normalizedEmail, name: name || normalizedEmail };
      db.data.teachers.push(teacher);
    }
    userId = teacher.id;
  }

  await db.write();

  const token = createToken({ id: userId, email: normalizedEmail, role });
  res.json({ ok: true, token, role });
});

// ======================================================================
// TEACHER ROUTES
// ======================================================================

// Create a new weekly quiz set
app.post('/api/teacher/quiz', requireTeacher, async (req, res) => {
  const { title, questions } = req.body;
  if (!title || !Array.isArray(questions) || questions.length === 0) {
    return res.status(400).json({ error: 'Title and at least one question are required' });
  }

  await db.read();
  // Deactivate previous quiz sets (only one active quiz at a time, keeps it simple for students)
  db.data.quizSets.forEach((q) => (q.isActive = false));

  const normalizedQuestions = questions
    .map((q) => normalizeQuizQuestion(q, 72))
    .filter((q) => q.text);

  const quizSet = {
    id: uuidv4(),
    title,
    questions: normalizedQuestions.map((q) => ({
      id: uuidv4(),
      text: q.text,
      options: q.options,
      timeLimitSec: q.timeLimitSec || 72,
    })),
    createdAt: Date.now(),
    isActive: true,
    timeLimitSec: 72,
  };
  db.data.quizSets.push(quizSet);
  await db.write();

  res.json({ ok: true, quizSet });
});

// Generate quiz questions using Gemini AI
app.post('/api/teacher/generate-questions', requireTeacher, async (req, res) => {
  const { topic, count } = req.body;
  if (!topic) {
    return res.status(400).json({ error: 'Topic is required' });
  }

  const requestedCount = Math.max(parseInt(count, 10) || 5, 1);
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: 'Gemini API Key is not configured on the server.' });
  }

  async function fetchQuestionBatch(batchSize) {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `Generate exactly ${batchSize} educational multiple-choice quiz questions for the topic: "${topic}". Each question must be a single, clear MCQ with exactly four options and one correct answer. Return the result strictly as a JSON array of objects in this shape: [{"text":"...","options":["...","...","...","..."]}] . Keep the wording concise, relevant to the topic, and make the distractors plausible.`
          }]
        }],
        generationConfig: {
          responseMimeType: 'application/json'
        }
      })
    });

    if (!response.ok) {
      const errJson = await response.json().catch(() => ({}));
      throw new Error(errJson.error?.message || 'Failed to generate questions from Gemini API');
    }

    const data = await response.json();
    const generatedText = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!generatedText) {
      throw new Error('Invalid response format from Gemini API.');
    }

    const questions = JSON.parse(generatedText);
    if (!Array.isArray(questions)) {
      throw new Error('Gemini API did not return an array of questions.');
    }

    return questions
      .map((question) => {
        const text = String(question?.text ?? '').trim();
        const options = Array.isArray(question?.options)
          ? question.options.map((option) => String(option ?? '').trim()).filter(Boolean).slice(0, 4)
          : [];
        return { text, options: options.length === 4 ? options : [] };
      })
      .filter((question) => question.text && question.options.length === 4);
  }

  try {
    const allQuestions = [];
    let remaining = requestedCount;
    let attempts = 0;
    const maxAttempts = Math.max(5, Math.ceil(requestedCount / 8));

    while (allQuestions.length < requestedCount && attempts < maxAttempts) {
      const batchSize = Math.min(Math.max(remaining, 1), 8);
      const batch = await fetchQuestionBatch(batchSize);
      allQuestions.push(...batch.slice(0, batchSize));
      remaining = requestedCount - allQuestions.length;
      attempts += 1;
    }

    console.log(`[ai-generate] requested=${requestedCount} generated=${allQuestions.length} attempts=${attempts}`);
    res.json({ ok: true, questions: allQuestions.slice(0, requestedCount) });
  } catch (err) {
    console.error('Error generating questions:', err);
    res.status(500).json({ error: 'An error occurred while generating questions.' });
  }
});


// List all quiz sets (history)
app.get('/api/teacher/quiz', requireTeacher, async (req, res) => {
  await db.read();
  res.json({ quizSets: db.data.quizSets.sort((a, b) => b.createdAt - a.createdAt) });
});

// Get all attempts/answers for a quiz set
app.get('/api/teacher/quiz/:quizId/attempts', requireTeacher, async (req, res) => {
  await db.read();
  const { quizId } = req.params;
  const quizSet = db.data.quizSets.find((q) => q.id === quizId);
  if (!quizSet) return res.status(404).json({ error: 'Quiz not found' });

  const attempts = db.data.attempts
    .filter((a) => a.quizSetId === quizId)
    .map((a) => {
      const student = db.data.students.find((s) => s.id === a.studentId);
      return {
        ...a,
        studentEmail: student ? student.email : 'unknown',
        studentName: student ? student.name : 'unknown',
      };
    });

  res.json({ quizSet, attempts });
});

// Reset a student's attempt data so they can start over.
app.post('/api/teacher/quiz/:quizId/attempts/:studentId/reset', requireTeacher, async (req, res) => {
  await db.read();
  const { quizId, studentId } = req.params;
  const attemptIndex = db.data.attempts.findIndex(
    (a) => a.quizSetId === quizId && a.studentId === studentId
  );

  if (attemptIndex === -1) {
    return res.status(404).json({ error: 'Attempt not found' });
  }

  db.data.attempts.splice(attemptIndex, 1);
  await db.write();
  res.json({ ok: true });
});

// Download attempts as Excel
app.get('/api/teacher/quiz/:quizId/export', requireTeacher, async (req, res) => {
  await db.read();
  const { quizId } = req.params;
  const quizSet = db.data.quizSets.find((q) => q.id === quizId);
  if (!quizSet) return res.status(404).json({ error: 'Quiz not found' });

  const attempts = db.data.attempts.filter((a) => a.quizSetId === quizId);

  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Responses');

  // Build columns: Student Name, Student Email, Status, Tab Switches, Submitted At, then one column per question
  const columns = [
    { header: 'Student Name', key: 'name', width: 22 },
    { header: 'Student Email', key: 'email', width: 28 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Tab Switches', key: 'tabSwitches', width: 14 },
    { header: 'Submitted At', key: 'submittedAt', width: 22 },
    ...quizSet.questions.map((q, idx) => ({ header: `Q${idx + 1}: ${q.text}`, key: q.id, width: 30 })),
  ];
  sheet.columns = columns;
  sheet.getRow(1).font = { bold: true };

  attempts.forEach((a) => {
    const student = db.data.students.find((s) => s.id === a.studentId);
    const row = {
      name: student ? student.name : 'unknown',
      email: student ? student.email : 'unknown',
      status: a.status,
      tabSwitches: a.tabSwitchCount,
      submittedAt: a.submittedAt ? new Date(a.submittedAt).toLocaleString() : '',
    };
    quizSet.questions.forEach((q) => {
      row[q.id] = a.answers[q.id] || '';
    });
    sheet.addRow(row);
  });

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${quizSet.title.replace(/\s+/g, '_')}_responses.xlsx"`);
  await workbook.xlsx.write(res);
  res.end();
});

// ======================================================================
// STUDENT ROUTES
// ======================================================================

// Get the currently active quiz, with THIS student's shuffled question order.
// Also returns any in-progress answers/tab-switch count if they already started.
app.get('/api/student/quiz/active', requireStudent, async (req, res) => {
  await db.read();
  const quizSet = db.data.quizSets.find((q) => q.isActive);
  if (!quizSet) return res.json({ quizSet: null });

  let attempt = db.data.attempts.find((a) => a.studentId === req.user.id && a.quizSetId === quizSet.id);

  if (!attempt) {
    const seed = `${req.user.id}::${quizSet.id}`;
    const order = seededShuffle(quizSet.questions.map((q) => q.id), seed);
    attempt = {
      id: uuidv4(),
      studentId: req.user.id,
      quizSetId: quizSet.id,
      questionOrder: order,
      answers: {},
      tabSwitchCount: 0,
      status: 'in_progress',
      startedAt: Date.now(),
      submittedAt: null,
    };
    db.data.attempts.push(attempt);
    await db.write();
  }

  // Build the question list in THIS student's shuffled order
  const questionsById = Object.fromEntries(quizSet.questions.map((q) => [q.id, q]));
  const orderedQuestions = attempt.questionOrder.map((qid) => questionsById[qid]).filter(Boolean);

  res.json({
    quizSet: { id: quizSet.id, title: quizSet.title, timeLimitSec: quizSet.timeLimitSec || 72 },
    questions: orderedQuestions,
    answers: attempt.answers,
    tabSwitchCount: attempt.tabSwitchCount,
    status: attempt.status,
  });
});

// Save an answer to one question (auto-save as the student types/selects)
app.post('/api/student/quiz/:quizId/answer', requireStudent, async (req, res) => {
  const { questionId, answer } = req.body;
  await db.read();
  const attempt = db.data.attempts.find(
    (a) => a.studentId === req.user.id && a.quizSetId === req.params.quizId
  );
  if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
  if (attempt.status !== 'in_progress') return res.status(400).json({ error: 'Quiz already submitted' });

  attempt.answers[questionId] = answer;
  await db.write();
  res.json({ ok: true });
});

// Report a tab-switch / visibility-change event.
// After the 3rd switch, the attempt is auto-submitted.
app.post('/api/student/quiz/:quizId/tab-switch', requireStudent, async (req, res) => {
  await db.read();
  const attempt = db.data.attempts.find(
    (a) => a.studentId === req.user.id && a.quizSetId === req.params.quizId
  );
  if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
  if (attempt.status !== 'in_progress') {
    return res.json({ ok: true, status: attempt.status, tabSwitchCount: attempt.tabSwitchCount });
  }

  attempt.tabSwitchCount += 1;

  let autoSubmitted = false;
  if (attempt.tabSwitchCount >= 3) {
    attempt.status = 'auto_submitted';
    attempt.submittedAt = Date.now();
    autoSubmitted = true;
  }

  await db.write();
  res.json({ ok: true, status: attempt.status, tabSwitchCount: attempt.tabSwitchCount, autoSubmitted });
});

// Manual submit (student clicks "Submit")
app.post('/api/student/quiz/:quizId/submit', requireStudent, async (req, res) => {
  await db.read();
  const attempt = db.data.attempts.find(
    (a) => a.studentId === req.user.id && a.quizSetId === req.params.quizId
  );
  if (!attempt) return res.status(404).json({ error: 'Attempt not found' });
  if (attempt.status !== 'in_progress') return res.status(400).json({ error: 'Already submitted' });

  attempt.status = 'submitted';
  attempt.submittedAt = Date.now();
  await db.write();
  res.json({ ok: true });
});

// ---------- Start server ----------
initDb().then((database) => {
  db = database;
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
    if (!process.env.GMAIL_USER) {
      console.log('NOTE: No GMAIL_USER configured - OTPs will be logged to console instead of emailed.');
    }
    if (TEACHER_EMAILS.length === 0) {
      console.log('WARNING: No TEACHER_EMAILS configured in .env - no one will be able to log in as teacher.');
    }
  });
});
