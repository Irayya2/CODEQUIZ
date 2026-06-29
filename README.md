# Weekly Quiz App

A simple quiz app for one teacher and their students:

- Students and the teacher log in with **email OTP only** — no passwords.
- The teacher posts a set of questions every week.
- Each student sees the **same questions in a different (shuffled) order**, so
  "Question 1" isn't the same question for every student.
- If a student switches tabs/apps **3 times**, their answers are
  **automatically submitted** and the quiz locks.
- The teacher can view all responses on screen, or **download them as an
  Excel file**.

---

## ⚠️ Read this first: what "reach every student anywhere" actually requires

For this to work for real students from any location, three things need to be
true, and none of them happen automatically just by writing the code:

1. **The backend needs to run on a public server**, not your laptop — if your
   laptop is off or asleep, the app is down for everyone.
2. **You need an email account configured to send OTPs** (instructions below
   — takes about 5 minutes, completely free for this scale).
3. **Students need a URL to visit** — this comes for free once you deploy to
   any of the hosts below.

The good news: this whole stack is built specifically to be deployable for
**free**, in under an hour, on hosts that don't require a credit card for
this scale of usage.

---

## How honest should you be with "students" about screen-switch detection?

The 3-strikes screen-switch rule uses the browser's standard tab-visibility
signal. It reliably detects switching tabs, switching apps, or minimizing the
window. It is the same mechanism most online exam tools use. Like all
browser-based detection, a sufficiently determined student with a second
device could still look up answers without it being detected — no
client-side check can fully prevent that. It is a reasonable deterrent for a
self-paced weekly class quiz, not a forensic exam-proctoring system.

---

## Project structure

```
quiz-app/
  server/     <- Node.js backend (API, database, OTP emails, Excel export)
  client/     <- React frontend (what students/teacher see in the browser)
```

---

## Part 1 — Run it locally first (to make sure everything works)

You'll need [Node.js](https://nodejs.org) installed (version 18 or higher).

### 1. Set up the backend

```bash
cd server
npm install
cp .env.example .env
```

Open `.env` and fill in:

```
TEACHER_EMAILS=youremail@example.com
```

(Leave `GMAIL_USER` and `GMAIL_APP_PASSWORD` blank for now — without them,
OTP codes print to the terminal instead of being emailed, which is perfect
for testing.)

Start it:

```bash
npm start
```

You should see `Server running on http://localhost:4000`.
(If there's no `npm start` script yet, run `node index.js` instead.)

### 2. Set up the frontend

Open a **second terminal**:

```bash
cd client
npm install
cp .env.example .env
npm run dev
```

It will print a URL like `http://localhost:5173` — open that in your
browser.

### 3. Try it out

- Log in as **Teacher** using the email you put in `TEACHER_EMAILS`.
- Check the **first terminal** (the server) — the OTP code will be printed
  there like `OTP for youremail@example.com: 123456`.
- Post a quiz with a couple of questions.
- Open the site again in an **incognito window** (or a different browser),
  log in as **Student** with any email, and you'll see the quiz.
- Switch tabs 3 times and watch it auto-submit.
- Go back to the teacher view → "View responses" → "Download as Excel".

If all of that works, you're ready to deploy.

---

## Part 2 — Set up real email OTPs (free, ~5 minutes)

This uses a Gmail account to send OTP codes. You can use your own, but it's
cleaner to create a dedicated one (e.g. `yourquizapp@gmail.com`).

1. Go to [myaccount.google.com/security](https://myaccount.google.com/security)
   and turn on **2-Step Verification** if it isn't already on.
2. Go to [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
3. Create a new app password, name it "Quiz App", and copy the 16-character
   password it gives you (you won't see it again).
4. In `server/.env`, fill in:

```
GMAIL_USER=yourquizapp@gmail.com
GMAIL_APP_PASSWORD=the16characterpassword
```

Restart the server (`Ctrl+C` then `npm start` again) and OTPs will now be
real emails. Gmail's free sending limit (~500 emails/day) is far more than
one class needs in a week.

---

## Part 3 — Deploy so students anywhere can reach it

You need to deploy **two things**: the backend (server folder) and the
frontend (client folder). Below is the simplest free path.

### Deploy the backend — [Render.com](https://render.com)

1. Push this project to a GitHub repository (a free GitHub account works).
2. On Render: **New → Web Service** → connect your repo.
3. Set:
   - **Root directory**: `server`
   - **Build command**: `npm install`
   - **Start command**: `node index.js`
4. Under **Environment Variables**, add the same values from your
   `server/.env` file (`TEACHER_EMAILS`, `GMAIL_USER`, `GMAIL_APP_PASSWORD`,
   and a `JWT_SECRET` — make this a long random string).
5. Deploy. Render gives you a URL like
   `https://your-quiz-backend.onrender.com` — copy it.

   > **Note on the free tier:** Render's free web services "sleep" after 15
   > minutes of no traffic, and take ~30–60 seconds to wake up on the next
   > request. For a weekly quiz this is usually fine (the first
   > student each week waits a little longer); if that's not acceptable,
   > Render's cheapest paid tier (~$7/month) removes the sleep behavior.

   > **Note on the database:** This app stores its data in a JSON file on
   > disk (`server/data/db.json`). Render's free tier does **not** guarantee
   > this file survives a redeploy. For light use this is often fine, but if
   > you want answers to definitely persist long-term, add a free persistent
   > disk in Render's dashboard (Render → your service → **Disks** → mount at
   > `/opt/render/project/src/server/data`), or ask a developer to swap in a
   > proper hosted database later — the code is written so that's a small,
   > contained change (everything goes through `db.js`).

### Deploy the frontend — [Vercel.com](https://vercel.com) or [Netlify.com](https://netlify.com)

1. On Vercel: **New Project** → import the same GitHub repo.
2. Set:
   - **Root directory**: `client`
   - **Framework preset**: Vite (should auto-detect)
3. Under **Environment Variables**, add:
   ```
   VITE_API_URL=https://your-quiz-backend.onrender.com
   ```
   (use the real backend URL from the previous step)
4. Deploy. You'll get a URL like `https://your-quiz-app.vercel.app` — **this
   is the link you give to students and your teacher.**

---

## Day-to-day use, once deployed

- **Teacher**: visit the site → Teacher tab → sign in with email OTP → post
  this week's questions → later, View responses → Download as Excel.
- **Students**: visit the same site → Student tab → sign in with email OTP →
  answer the questions → Submit.
- Posting a new quiz **replaces** the currently active one — there's always
  exactly one "live" quiz at a time, matching the weekly cycle.

---

## A note on email-only OTP for students with no personal email

Since login is email-OTP only, every student needs an email inbox they can
check at login time (e.g. their college email). If some students only have a
phone number and no usable email, mobile SMS OTP can be added later — it
needs an SMS provider account (e.g. Twilio or, for India specifically, an
MSG91/DLT-registered sender), which takes a few days to set up due to
carrier registration requirements. The codebase is structured so this can be
added without rebuilding the login flow.
