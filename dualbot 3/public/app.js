const thread = document.getElementById("thread");
const emptyState = document.getElementById("emptyState");
const form = document.getElementById("composer");
const input = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");
const tabs = document.querySelectorAll(".tab");
const imageInput = document.getElementById("imageInput");
const imagePreview = document.getElementById("imagePreview");
const imagePreviewImg = document.getElementById("imagePreviewImg");
const removeImageBtn = document.getElementById("removeImageBtn");
const micBtn = document.getElementById("micBtn");
const lightbox = document.getElementById("lightbox");
const lightboxImg = document.getElementById("lightboxImg");
const lightboxClose = document.getElementById("lightboxClose");

const ACCENTS = { straight: "#5b8dbf", eli5: "#e8a33d", code: "#5bbf8d" };
const LABELS = { straight: "Straight Bot", eli5: "ELI5 Bot", code: "Code Bot" };

const STORAGE_KEY = "zelusai-history-v1";

// Each persona keeps its own separate conversation history.
const histories = { straight: [], eli5: [], code: [] };
let activePersona = "straight";
let pendingImage = null; // { base64, mimeType, dataUrl }

function loadSavedHistories() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    Object.keys(histories).forEach((persona) => {
      if (Array.isArray(saved[persona])) histories[persona] = saved[persona];
    });
  } catch (err) {
    console.warn("Could not load saved history:", err);
  }
}

function saveHistories() {
  try {
    const slim = {};
    Object.keys(histories).forEach((persona) => {
      slim[persona] = histories[persona].map(({ role, content }) => ({ role, content }));
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
  } catch (err) {
    console.warn("Could not save history:", err);
  }
}

function setPersona(persona) {
  activePersona = persona;
  document.documentElement.style.setProperty("--accent-color", ACCENTS[persona]);
  tabs.forEach((t) => {
    const isActive = t.dataset.persona === persona;
    t.classList.toggle("is-active", isActive);
    t.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  renderHistory();
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => setPersona(tab.dataset.persona));
});

function renderHistory() {
  thread.querySelectorAll(".msg").forEach((el) => el.remove());
  const hist = histories[activePersona];
  emptyState.style.display = hist.length ? "none" : "block";
    hist.forEach((turn) =>
    addBubble(
      turn.role === "assistant" ? "bot" : "user",
      turn.content,
      activePersona,
      turn.imageDataUrl
    )
  );
  thread.scrollTop = thread.scrollHeight;
}

function wireCodeBlocks(container) {
  container.querySelectorAll("pre code").forEach((codeEl) => {
    if (window.hljs) hljs.highlightElement(codeEl);
    const pre = codeEl.parentElement;
    if (pre.parentElement.classList.contains("code-block-wrap")) return;
    const wrap = document.createElement("div");
    wrap.className = "code-block-wrap";
    pre.parentNode.insertBefore(wrap, pre);
    wrap.appendChild(pre);
    const btn = document.createElement("button");
    btn.className = "copy-btn";
    btn.type = "button";
    btn.textContent = "Copy";
    btn.addEventListener("click", () => {
      navigator.clipboard.writeText(codeEl.textContent).then(() => {
        btn.textContent = "Copied!";
        setTimeout(() => (btn.textContent = "Copy"), 1500);
      });
    });
    wrap.appendChild(btn);
  });
}
function addThinkingBubble(persona) {
  emptyState.style.display = "none";
  const el = document.createElement("div");
  el.className = `msg msg-bot persona-${persona} typing`;
  el.style.setProperty("--accent-color", ACCENTS[persona]);

  const label = document.createElement("span");
  label.className = "msg-label";
  label.textContent = LABELS[persona];
  el.appendChild(label);

  const row = document.createElement("div");
  row.className = "thinking-row";
  const img = document.createElement("img");
  img.className = "thinking-logo";
  img.src = "icon-192.png";
  img.alt = "";
  row.appendChild(img);
  el.appendChild(row);

  thread.appendChild(el);
  thread.scrollTop = thread.scrollHeight;
  return el;
}
function addBubble(role, text, persona, imageDataUrl) {
  emptyState.style.display = "none";
  const el = document.createElement("div");
  el.className = role === "user" ? "msg msg-user" : `msg msg-bot persona-${persona}`;
  el.style.setProperty("--accent-color", ACCENTS[persona]);

  if (role === "bot") {
    const label = document.createElement("span");
    label.className = "msg-label";
    label.textContent = LABELS[persona];
    el.appendChild(label);
  }

  if (text) {
    const body = document.createElement("div");
    body.className = "msg-body";
    if (role === "bot" && window.marked && window.DOMPurify) {
      const rawHtml = marked.parse(text);
      body.innerHTML = DOMPurify.sanitize(rawHtml);
      wireCodeBlocks(body);
      if (window.renderMathInElement) {
        renderMathInElement(body, {
          delimiters: [
            { left: "$$", right: "$$", display: true },
            { left: "$", right: "$", display: false },
          ],
          throwOnError: false,
        });
      }
    } else {
      body.textContent = text;
    }
    el.appendChild(body);
  }

  if (imageDataUrl) {
    const img = document.createElement("img");
    img.className = "msg-image";
    img.src = imageDataUrl;
    img.addEventListener("click", () => openLightbox(imageDataUrl));
    el.appendChild(img);
  }

  thread.appendChild(el);
  thread.scrollTop = thread.scrollHeight;
  return el;
}

function openLightbox(src) {
  lightboxImg.src = src;
  lightbox.hidden = false;
}
function closeLightbox() {
  lightbox.hidden = true;
  lightboxImg.src = "";
}
lightboxClose.addEventListener("click", closeLightbox);
lightbox.addEventListener("click", (e) => {
  if (e.target === lightbox) closeLightbox();
});
imagePreviewImg.addEventListener("click", () => {
  if (pendingImage) openLightbox(pendingImage.dataUrl);
});

// --- image attach handling ---

imageInput.addEventListener("change", () => {
  const file = imageInput.files && imageInput.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const rawDataUrl = reader.result;
    // Normalize to JPEG via canvas - fixes HEIC (iPhone default) and
    // any other format some AI APIs don't directly accept.
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const MAX_DIM = 1600;
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        const scale = MAX_DIM / Math.max(width, height);
        width = Math.round(width * scale);
        height = Math.round(height * scale);
      }
      canvas.width = width;
      canvas.height = height;
      canvas.getContext("2d").drawImage(img, 0, 0, width, height);
      const jpegDataUrl = canvas.toDataURL("image/jpeg", 0.9);
      const base64 = jpegDataUrl.split(",")[1];
      pendingImage = { base64, mimeType: "image/jpeg", dataUrl: jpegDataUrl };
      imagePreviewImg.src = jpegDataUrl;
      imagePreview.hidden = false;
    };
    img.onerror = () => {
      addBubble("bot", "Couldn't read that image - try a different photo.", activePersona);
    };
    img.src = rawDataUrl;
  };
  reader.readAsDataURL(file);
});

removeImageBtn.addEventListener("click", () => {
  pendingImage = null;
  imageInput.value = "";
  imagePreview.hidden = true;
});

// --- voice input ---

const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
let recognition = null;
let listening = false;
if (SpeechRecognitionCtor) {
  recognition = new SpeechRecognitionCtor();
  recognition.continuous = false;
  recognition.interimResults = false;
  recognition.onresult = (e) => {
    const transcript = e.results[0][0].transcript;
    input.value = (input.value ? input.value + " " : "") + transcript;
  };
  recognition.onend = () => {
    listening = false;
    micBtn.classList.remove("listening");
  };
  recognition.onerror = (e) => {
    listening = false;
    micBtn.classList.remove("listening");
    addBubble(
      "bot",
      "Mic error: " + e.error + ". Voice input needs microphone permission over https.",
      activePersona
    );
  };
} else {
  micBtn.title = "Voice input isn't supported in this browser";
}

micBtn.addEventListener("click", () => {
  if (!recognition) {
    addBubble("bot", "Voice input isn't supported in this browser.", activePersona);
    return;
  }
  if (listening) {
    recognition.stop();
    return;
  }
  listening = true;
  micBtn.classList.add("listening");
  try {
    recognition.start();
  } catch (err) {
    listening = false;
    micBtn.classList.remove("listening");
  }
});

// --- sending ---

async function handleSend(e) {
  if (e) e.preventDefault();
  const message = input.value.trim();
  const attachedImage = pendingImage;
  if (!message && !attachedImage) return;

  const persona = activePersona;
  const userTurn = { role: "user", content: message };
  if (attachedImage) userTurn.imageDataUrl = attachedImage.dataUrl;
  histories[persona].push(userTurn);
  addBubble("user", message, persona, attachedImage ? attachedImage.dataUrl : null);
  saveHistories();

  input.value = "";
  pendingImage = null;
  imageInput.value = "";
  imagePreview.hidden = true;
  sendBtn.disabled = true;

 const typingEl = addThinkingBubble(persona);

  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        persona,
        message,
        image: attachedImage ? attachedImage.base64 : undefined,
        mimeType: attachedImage ? attachedImage.mimeType : undefined,
        // text-only history for context; images from past turns aren't resent
        history: histories[persona]
          .slice(0, -1)
          .map((t) => ({ role: t.role, content: t.content })),
      }),
    });

    const data = await res.json();
    typingEl.remove();

    if (!res.ok) {
      addBubble("bot", `Error: ${data.error || "something went wrong."}`, persona);
      return;
    }

    histories[persona].push({ role: "assistant", content: data.reply });
    addBubble("bot", data.reply, persona);
    saveHistories();
  } catch (err) {
    typingEl.remove();
    addBubble("bot", "Couldn't reach the server. Is it running?", persona);
  } finally {
    sendBtn.disabled = false;
    input.focus();
  }
}

form.addEventListener("submit", handleSend);
sendBtn.addEventListener("click", handleSend);
input.addEventListener("keydown", (e) => {
  if (e.key === "Enter") handleSend(e);
});

loadSavedHistories();
setPersona("straight");
