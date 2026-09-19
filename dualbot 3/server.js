// server.js
// Small backend for the Zelus AI chat demo.
// It does exactly one important job: keep your Gemini API key
// on the server, never send it to the browser.
// Uses Google Gemini (free, no credit card needed) and supports
// sending an image along with your message - handy for math
// problems you photograph instead of typing out.

const express = require("express");
const path = require("path");
require("dotenv").config();

const app = express();
app.use(express.json({ limit: "12mb" })); // images make requests bigger
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.GEMINI_API_KEY;
const MODEL = "gemini-3.6-flash";

const MATH_INSTRUCTIONS =
  "If the person sends an image of a question (especially a math " +
  "problem), read it carefully and solve it with clear, correctly " +
  "ordered steps, showing the reasoning for each step, then state the " +
  "final answer clearly on its own line at the end. Double-check your " +
  "arithmetic before answering.";

// Each persona is just a different system prompt against the same model.
const PERSONAS = {
  straight: {
    label: "Straight Bot",
    system:
      "You are Straight Bot. Give accurate, direct, no-nonsense answers. " +
      "No jokes, no fluff, no simplification for simplification's sake. " +
      "Assume the person wants precision and gets to the point fast. " +
      "Keep answers reasonably concise. " +
      MATH_INSTRUCTIONS,
  },
  eli5: {
    label: "ELI5 Bot",
    system:
      "You are ELI5 Bot. Explain everything like you're talking to a " +
      "curious 8-year-old: simple words, short sentences, and a fun, " +
      "concrete analogy wherever it helps. Warm and playful tone, but " +
      "never wrong or condescending - just simple. Keep answers short. " +
      MATH_INSTRUCTIONS,
  },
  code: {
    label: "Code Bot",
    system:
      "You are Code Bot. You are fluent in Java, Python, JavaScript, " +
      "TypeScript, C, C++, C#, Go, Rust, Swift, Kotlin, Ruby, PHP, SQL, " +
      "and any other common language the person asks for. Answer " +
      "primarily with clean, correct, well-commented code in a fenced " +
      "code block that always specifies the language (e.g. ```java). " +
      "Keep prose minimal - at most a short sentence before or after " +
      "the code, only when it genuinely adds something. If the person " +
      "sends an image of code or an error, read it carefully and fix " +
      "or explain it precisely.",
  },
};

app.post("/api/chat", async (req, res) => {
  try {
    const { persona, message, image, mimeType, history } = req.body;

    const config = PERSONAS[persona];
    if (!config) {
      return res.status(400).json({ error: "Unknown persona." });
    }
    const hasText = typeof message === "string" && message.trim().length > 0;
    const hasImage = typeof image === "string" && image.length > 0;
    if (!hasText && !hasImage) {
      return res.status(400).json({ error: "Send a message or an image." });
    }
    if (!API_KEY) {
      return res.status(500).json({
        error: "Server has no GEMINI_API_KEY set. Add one to your .env file.",
      });
    }

    // history is prior text-only turns from the browser: [{role, content}, ...]
    const priorTurns = Array.isArray(history) ? history.slice(-16) : [];
    const contents = priorTurns.map((turn) => ({
      role: turn.role === "assistant" ? "model" : "user",
      parts: [{ text: turn.content }],
    }));

    const parts = [];
    if (hasText) parts.push({ text: message });
    if (hasImage) {
      parts.push({
        inline_data: {
          mime_type: mimeType || "image/jpeg",
          data: image, // base64, no data: prefix
        },
      });
      if (!hasText) {
        parts.push({ text: "Please solve this." });
      }
    }
    contents.push({ role: "user", parts });

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents,
          systemInstruction: { parts: [{ text: config.system }] },
          generationConfig: { maxOutputTokens: 1500 },
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", errText);
      return res.status(502).json({ error: "Upstream API error." });
    }

    const data = await response.json();
    const reply =
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts.map((p) => p.text || "").join("");

    res.json({ reply: reply || "(no response)" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong on the server." });
  }
});

app.listen(PORT, () => {
  console.log(`Zelus AI running at http://localhost:${PORT}`);
});
