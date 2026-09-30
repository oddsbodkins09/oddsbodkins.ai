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

const menuBtn = document.getElementById("menuBtn");
const sidebar = document.getElementById("sidebar");
const sidebarOverlay = document.getElementById("sidebarOverlay");
const sidebarClose = document.getElementById("sidebarClose");
const sidebarPersonaLabel = document.getElementById("sidebarPersonaLabel");
const newChatBtn = document.getElementById("newChatBtn");
const chatList = document.getElementById("chatList");

const ACCENTS = { straight: "#5b8dbf", eli5: "#e8a33d", code: "#5bbf8d" };
const LABELS = { straight: "Straight Bot", eli5: "ELI5 Bot", code: "Code Bot" };

const STORAGE_KEY = "zelusai-chats-v1";

// chatsByPersona.straight = [ { id, title, titled, messages: [{role, content, imageDataUrl}] }, ... ]
let chatsByPersona = { straight: [], eli5: [], code: [] };
let activeChatId = { straight: null, eli5: null, code: null };
let activePersona = "straight";
let pendingImage = null; // { base64, mimeType, dataUrl }

function newChatObj() {
  return {
    id: "c" + Date.now() + Math.random().toString(36).slice(2, 7),
    title: "New Chat",
    titled: false,
    messages: [],
  };
}

function ensureAtLeastOneChat(persona) {
  if (chatsByPersona[persona].length === 0) {
    const c = newChatObj();
    chatsByPersona[persona].push(c);
    activeChatId[persona] = c.id;
  }
  if (!activeChatId[persona]) {
    activeChatId[persona] = chatsByPersona[persona][0].id;
  }
}

function getActiveChat(persona) {
  ensureAtLeastOneChat(persona);
  return chatsByPersona[persona].find((c) => c.id === activeChatId[persona]);
}

function loadSaved() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    Object.keys(chatsByPersona).forEach((persona) => {
      if (Array.isArray(saved.chatsByPersona && saved.chatsByPersona[persona])) {
        chatsByPersona[persona] = saved.chatsByPersona[persona];
      }
    });
    if (saved.activeChatId) activeChatId = saved.activeChatId;
  } catch (err) {
    console.warn("Could not load saved chats:", err);
  }
}

function saveAll() {
  try {
    // Strip image data before saving - keeps storage small and reliable
    const slim = {};
    Object.keys(chatsByPersona).forEach((persona) => {
      slim[persona] = chatsByPersona[persona].map((c) => ({
        id: c.id,
        title: c.title,
        titled: c.titled,
        messages: c.messages.map(({ role, content }) => ({ role, content })),
      }));
    });
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ chatsByPersona: slim, activeChatId }));
  } catch (err) {
    console.warn("Could not save chats:", err);
  }
}

// --- persona / bot switching ---

function setPersona(persona) {
  activePersona = persona;
  document.documentElement.style.setProperty("--accent-color", ACCENTS[persona]);
  tabs.forEach((t) => {
    const isActive = t.dataset.persona === persona;
    t.classList.toggle("is-active", isActive);
    t.setAttribute("aria-selected", isActive ? "true" : "false");
  });
  sidebarPersonaLabel.textContent = LABELS[persona];
  ensureAtLeastOneChat(persona);
  renderThread();
  renderChatList();
}

tabs.forEach((tab) => {
  tab.addEventListener("click", () => setPersona(tab.dataset.persona));
});

// --- sidebar ---

function openSidebar() {
  sidebar.classList.add("open");
  sidebarOverlay.hidden = false;
}
function closeSidebar() {
  sidebar.classList.remove("open");
  sidebarOverlay.hidden = true;
}
menuBtn.addEventListener("click", openSidebar);
sidebarClose.addEventListener("click", closeSidebar);
sidebarOverlay.addEventListener("click", closeSidebar);

newChatBtn.addEventListener("click", () => {
  const c = newChatObj();
  chatsByPersona[activePersona].unshift(c);
  activeChatId[activePersona] = c.id;
  saveAll();
  renderThread();
  renderChatList();
  closeSidebar();
  input.focus();
});

function renderChatList() {
  chatList.innerHTML = "";
  const chats = chatsByPersona[activePersona];
  chats.forEach((c) => {
    const item = document.createElement("div");
    item.className = "chat-item" + (c.id === activeChatId[activePersona] ? " active" : "");
    const title = document.createElement("span");
    title.className = "chat-title";
    title.textContent = c.title;
    item.appendChild(title);

    const del = document.createElement("button");
    del.className = "chat-delete";
    del.type = "button";
    del.textContent = "\u00d7";
    del.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteChat(activePersona, c.id);
    });
    item.appendChild(del);

    item.addEventListener("click", () => {
      activeChatId[activePersona] = c.id;
      saveAll();
      renderThread();
      renderChatList();
      closeSidebar();
    });

    chatList.appendChild(item);
  });
}

function deleteChat(persona, chatId) {
  chatsByPersona[persona] = chatsByPersona[persona].filter((c) => c.id !== chatId);
  if (activeChatId[persona] === chatId) {
    activeChatId[persona] = null;
    ensureAtLeastOneChat(persona);
  }
  saveAll();
  renderThread();
  renderChatList();
}

// --- rendering messages ---

function renderThread() {
  thread.querySelectorAll(".msg").forEach((el) => el.remove());
  const chat = getActiveChat(activePersona);
  emptyState.style.display = chat.messages.length ? "none" : "block";
  chat.messages.forEach((turn) =>
    addBubble(
      turn.role === "assistant" ? "bot" : "user",
      turn.content,
      activePersona,
      turn.imageDataUrl
    )
  );
  thread.scrollTop = thread.scrollHeight;
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

// --- auto-title generation ---

async function maybeGenerateTitle(persona, chat, userMessage, reply) {
  if (chat.titled) return;
  chat.titled = true; // mark immediately so we never fire twice, even if this call fails
  try {
    const res = await fetch("/api/title", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: userMessage, reply }),
    });
    const data = await res.json();
    if (res.ok && data.title) {
      chat.title = data.title;
      saveAll();
      if (persona === activePersona) renderChatList();
    }
  } catch (err) {
    console.warn("Could not generate title:", err);
  }
}

// --- sending ---

async function handleSend(e) {
  if (e) e.preventDefault();
  const message = input.value.trim();
  const attachedImage = pendingImage;
  if (!message && !attachedImage) return;

  const persona = activePersona;
  const chat = getActiveChat(persona);
  const isFirstExchange = chat.messages.length === 0;

  const userTurn = { role: "user", content: message };
  if (attachedImage) userTurn.imageDataUrl = attachedImage.dataUrl;
  chat.messages.push(userTurn);
  addBubble("user", message, persona, attachedImage ? attachedImage.dataUrl : null);
  saveAll();
  renderChatList();

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
        history: chat.messages.slice(0, -1).map((t) => ({ role: t.role, content: t.content })),
      }),
    });

    const data = await res.json();
    typingEl.remove();

    if (!res.ok) {
      addBubble("bot", `Error: ${data.error || "something went wrong."}`, persona);
      return;
    }

    chat.messages.push({ role: "assistant", content: data.reply });
    addBubble("bot", data.reply, persona);
    saveAll();

    if (isFirstExchange) {
      maybeGenerateTitle(persona, chat, message, data.reply);
    }
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

loadSaved();
setPersona("straight");
// Frontend image generation engine
async function handleImageGeneration(promptText) {
  const botMsgDiv = document.createElement("div");
  botMsgDiv.className = `message message-assistant message-${activePersona}`;
  const contentDiv = document.createElement("div");
  contentDiv.className = "message-content";
  contentDiv.innerHTML = `<p class="message-text-${activePersona}">🎨 Generating your image for: "<em>${promptText}</em>"... Please wait.</p>`;
  botMsgDiv.appendChild(contentDiv);
  thread.appendChild(botMsgDiv);
  thread.scrollTop = thread.scrollHeight;
  if (emptyState) emptyState.style.display = "none";

  try {
    const response = await fetch('/api/generate-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: promptText })
    });
    const data = await response.json();
    if (!response.ok || data.error) throw new Error(data.error || "Generation failed");

    contentDiv.innerHTML = `
      <p class="message-text-${activePersona}">Here is your generated image:</p>
      <img src="${data.imageUrl}" class="chat-generated-image" style="max-width: 100%; border-radius: 8px; margin-top: 8px; cursor: pointer; display: block;" alt="AI Generated Graphic" />
    `;

    const generatedImgElement = contentDiv.querySelector('.chat-generated-image');
    if (generatedImgElement && lightbox && lightboxImg) {
      generatedImgElement.addEventListener('click', () => {
        lightboxImg.src = data.imageUrl;
        lightbox.removeAttribute('hidden');
      });
    }

    const activeChats = chatsByPersona[activePersona];
    const currentChat = activeChats.find(c => c.id === activeChatId[activePersona]);
    if (currentChat) {
      currentChat.messages.push({ role: "assistant", content: `![AI Generated Graphic](${data.imageUrl})` });
      if (typeof saveToStorage === "function") saveToStorage();
    }
  } catch (err) {
    console.error("Frontend image error:", err);
    contentDiv.innerHTML = `<p class="message-text-${activePersona}" style="color: #ff6b6b;">❌ Image Generation Failed: ${err.message}</p>`;
  }
  thread.scrollTop = thread.scrollHeight;
}
// 2. Main submission listeners with built-in image intercept engine
if (form && input) {
  form.removeEventListener("submit", handleSend); // Clear original listener to prevent double fires
  form.addEventListener("submit", (e) => {
    const textValue = input.value.trim();
    if (textValue.startsWith("/image ")) {
      e.preventDefault();
      e.stopPropagation();
      const targetPrompt = textValue.replace("/image ", "").trim();
      input.value = ""; 
      if (targetPrompt.length > 0) handleImageGeneration(targetPrompt);
    } else {
      handleSend(e);
    }
  });
}

if (sendBtn) {
  sendBtn.removeEventListener("click", handleSend);
    sendBtn.addEventListener("click", (e) => {
    const textValue = input.value.trim();
    if (textValue.startsWith("/image ")) {
      e.preventDefault();
      e.stopPropagation();
      const targetPrompt = textValue.replace("/image ", "").trim();
      input.value = "";
      if (targetPrompt.length > 0) handleImageGeneration(targetPrompt);
    } else {
      handleSend(e);
    }
  });

  if (input) {
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        const textValue = input.value.trim();
        if (textValue.startsWith("/image ")) {
          e.preventDefault();
          e.stopPropagation();
          const targetPrompt = textValue.replace("/image ", "").trim();
          input.value = "";
          if (targetPrompt.length > 0) handleImageGeneration(targetPrompt);
        } else {
          handleSend(e);
        }
      }
    });
  }
