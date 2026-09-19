# Zelus AI

A tiny chat demo with two personas answering off the same AI model:

- **Straight Bot** — direct, precise, no fluff
- **ELI5 Bot** — explains everything like you're 8, with analogies

Same question, switch tabs, visibly different answer. You can also attach
a photo of a question (great for math problems) and it'll work through
the solution step by step.

Runs on Google's Gemini API, which has a genuinely free tier — no credit
card required to get an API key.

## How it's put together

- `public/` — the frontend: HTML, CSS, JS. This is what runs in the browser.
- `server.js` — a small backend. Its only real job is to hold your API key
  and make the actual call to Google's Gemini API, so the key is never
  visible to anyone opening the page.
- `.env` (you create this) — where your secret API key lives, never
  committed or shared.

You need the backend because if the API key lived in the browser code,
anyone could view-source the page, copy it, and rack up charges on your
account.

## Run it locally

1. Install [Node.js](https://nodejs.org) if you don't have it.
2. In this folder, install dependencies:
   ```
   npm install
   ```
3. Get an API key from [aistudio.google.com](https://aistudio.google.com),
   then copy the example env file and paste your key in:
   ```
   cp .env.example .env
   ```
   Edit `.env` so it reads:
   ```
   GEMINI_API_KEY=AIzaSy...your real key...
   ```
4. Start the server:
   ```
   npm start
   ```
5. Open `http://localhost:3000` in your browser.

## Showing it to other people (free, real link)

Running it on `localhost` only works on your own machine. To get a real
public link, no credit card needed:

1. Create a free account at [github.com](https://github.com) if you
   don't have one.
2. Click "New repository", name it (e.g. `zelus-ai`), keep it Public,
   and click "Create repository".
3. On the new repo's page, click "uploading an existing file" (or
   "Add file" → "Upload files"), then drag this whole `dualbot` folder
   in. This works entirely in the browser - no terminal needed.
4. Create a free account at [render.com](https://render.com) and sign
   in with your GitHub account.
5. Click "New" → "Web Service", pick the repo you just created.
6. Set Build Command to `npm install` and Start Command to `npm start`.
7. Under "Environment", add a variable: key `GEMINI_API_KEY`, value
   your real Gemini key.
8. Click "Create Web Service". After it finishes deploying (a few
   minutes), Render gives you a public URL like
   `https://zelus-ai.onrender.com` you can send to anyone.

Note: Render's free tier "sleeps" a service after periods of no use,
so the first visit after a while can take 30-60 seconds to wake up -
normal for a free host, not a bug.

## Extending it

- Add a third persona: copy a block in the `PERSONAS` object in
  `server.js`, then add a matching tab in `index.html` and an accent
  color in `app.js`.
- Each persona currently remembers its own separate conversation —
  that's intentional, so switching bots feels like switching to a
  different "person" rather than continuing one thread.
