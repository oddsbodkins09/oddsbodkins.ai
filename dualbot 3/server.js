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

    let response;
    let lastErrText = "";
    const MAX_ATTEMPTS = 3;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      response = await fetch(
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

      if (response.ok) break;

      lastErrText = await response.text();
      const isOverloaded = response.status === 503 || response.status === 429;
      if (!isOverloaded || attempt === MAX_ATTEMPTS) break;

      console.warn(`Gemini overloaded (attempt ${attempt}), retrying...`);
      await new Promise((r) => setTimeout(r, attempt * 800));
    }

    if (!response.ok) {
      console.error("Gemini API error:", lastErrText);
      return res.status(502).json({
        error:
          response.status === 503
            ? "The AI is under heavy load right now - please try again in a moment."
            : "Upstream API error.",
      });
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

app.post("/api/title", async (req, res) => {
  try {
    const { message, reply } = req.body;
    if (!API_KEY) {
      return res.status(500).json({ error: "No GEMINI_API_KEY set." });
    }
    const prompt =
      "Summarize the topic of this exchange in 3 to 5 words, title-case, " +
      "no punctuation at the end, no quotes around it, no explanation - " +
      "just the short title itself.\n\nUser: " +
      (message || "(sent an image)") +
      "\n\nAssistant: " +
      (reply || "").slice(0, 500);

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 20 },
        }),
      }
    );

    if (!response.ok) {
      return res.status(502).json({ error: "Could not generate title." });
    }

    const data = await response.json();
    let title =
      data.candidates &&
      data.candidates[0] &&
      data.candidates[0].content &&
      data.candidates[0].content.parts &&
      data.candidates[0].content.parts.map((p) => p.text || "").join("");
    title = (title || "New Chat").trim().replace(/^["']|["']$/g, "").slice(0, 40);

    res.json({ title: title || "New Chat" });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Something went wrong." });
  }
});
// Image Generation Endpoint using Imagen 3
app.post('/api/generate-image', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!API_KEY) {
      return res.status(500).json({ error: 'Gemini API key is missing on the server.' });
    }

    // Direct HTTP call to Google's Imagen API using your existing API_KEY setup
    const response = await fetch(
      `https://googleapis.com{API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: prompt,
          numberOfImages: 1,
          outputMimeType: 'image/jpeg',
          aspectRatio: '1:1',
        }),
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Google Imagen API Error Details:', errorData);
      return res.status(response.status).json({ error: 'Google Imagen API error occurred.' });
    }

    const data = await response.json();
    
    // Extract the raw base64 image string from Google's response format
    const base64Image = data.generatedImages[0].image.imageBytes;
    
    // Send it cleanly back to your frontend app.js handler
    res.json({ imageUrl: `data:image/jpeg;base64,${base64Image}` });
  } catch (error) {
    console.error('Image Generation Server Error:', error);
    res.status(500).json({ error: 'Failed to generate image structure.' });
  }
});
// Image Generation Endpoint using active flash image model pipeline
app.post('/api/generate-image', async (req, res) => {
  try {
    const { prompt } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    if (!API_KEY) {
      return res.status(500).json({ error: 'Gemini API key is missing on the server.' });
    }

    // Direct HTTP request to the active image generation engine endpoint
    const response = await fetch(
      `https://googleapis.com{API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `Generate an image based on this description: ${prompt}` }]
          }]
        })
      }
    );

    if (!response.ok) {
      const errorData = await response.json();
      console.error('Google AI Image API Error:', errorData);
      return res.status(response.status).json({ error: 'Image model engine rejected parameters.' });
    }

    const data = await response.json();
    
    // Extract base64 image data from the returned content block pipeline parts array
    let base64Image = null;
    const parts = data?.candidates?.[0]?.content?.parts || [];
    for (const part of parts) {
      if (part.inlineData && part.inlineData.data) {
        base64Image = part.inlineData.data;
        break;
      }
    }

    if (base64Image) {
      return res.json({ imageUrl: `data:image/jpeg;base64,${base64Image}` });
    } else {
      console.error('Unexpected layout format from Google:', JSON.stringify(data));
      return res.status(502).json({ error: 'Google did not return an inline image data stream.' });
    }

  } catch (error) {
    console.error('Image Generation Server Error:', error);
    res.status(500).json({ error: 'Failed to process backend image generation pipeline.' });
  }
});


app.listen(PORT, () => {
  console.log(`Zelus AI running at http://localhost:${PORT}`);
});
