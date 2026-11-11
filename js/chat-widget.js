// Shared customer <-> landlord chat widget (reused on both customer and landlord dashboards).
// Uses Barikhuji's existing design system and Socket.IO when available, with REST fallback.
window.BK_CHAT = (() => {
  const e = BK.esc;
  const PLACEHOLDER_THUMB = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><rect width="100%" height="100%" fill="#efe6d4"/></svg>'
  );

  function fmtTime(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleString("en-BD", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
  }

  function loadSocketScript() {
    if (window.io) return Promise.resolve(window.io);
    const base = (window.BK_CONFIG && window.BK_CONFIG.SOCKET_BASE) || "";
    if (!base || (window.BK_CONFIG && window.BK_CONFIG.USE_SAMPLE_DATA)) return Promise.resolve(null);
    return new Promise(resolve => {
      const s = document.createElement("script");
      s.src = base + "/socket.io/socket.io.js";
      s.async = true;
      s.onload = () => resolve(window.io || null);
      s.onerror = () => resolve(null);
      document.head.appendChild(s);
    });
  }

  function mount({ container, unreadBadge, initialConversationId } = {}) {
    if (!container) return;
    let conversations = [];
    let activeId = initialConversationId || null;
    let messages = [];
    let loadingList = true;
    let loadingMsgs = false;
    let listError = "";
    let msgError = "";
    let socket = null;

    function syncUnreadBadge() {
      const total = conversations.reduce((s, c) => s + (Number(c.unreadCount) || 0), 0);
      if (unreadBadge) {
        unreadBadge.textContent = String(total);
        unreadBadge.hidden = total <= 0;
      }
    }

    function render() {
      syncUnreadBadge();
      if (loadingList) {
        container.innerHTML = `<div class="panel"><p>Loading conversations…</p></div>`;
        return;
      }
      if (listError) {
        container.innerHTML = `<div class="empty"><h3>Could not load messages</h3><p>${e(listError)}</p><button class="btn sm" id="bk-chat-retry" type="button">Retry</button></div>`;
        container.querySelector("#bk-chat-retry")?.addEventListener("click", refreshConversations);
        return;
      }
      if (!conversations.length) {
        container.innerHTML = `<div class="empty"><h3>No conversations yet</h3><p>When you message a landlord or receive a message from a renter, your chat history appears here.</p></div>`;
        return;
      }

      const active = conversations.find(c => String(c.id) === String(activeId)) || null;
      container.innerHTML = `
        <div class="bk-chat ${active ? "has-active" : ""}">
          <div class="bk-chat-list" role="listbox" aria-label="Conversations">
            ${conversations.map(c => {
              const prop = c.property || {};
              const other = c.counterpart || {};
              const isSel = active && String(active.id) === String(c.id);
              return `
                <button type="button" class="bk-chat-item" data-conv="${e(c.id)}" role="option" aria-selected="${isSel ? "true" : "false"}">
                  <img class="bk-chat-thumb" src="${e(prop.thumbnail || PLACEHOLDER_THUMB)}" alt="">
                  <div class="bk-chat-meta">
                    <div class="bk-chat-top">
                      <strong>${e(other.name || "User")}</strong>
                      ${c.unreadCount > 0 ? `<span class="badge ok">${e(c.unreadCount)}</span>` : ""}
                    </div>
                    <div class="bk-chat-sub">${e(prop.title || "Property")}</div>
                    <div class="bk-chat-last">${e(c.lastMessageText || "No messages yet")}</div>
                  </div>
                </button>`;
            }).join("")}
          </div>
          <div class="bk-chat-thread">
            ${active ? renderThread(active) : `<div class="empty" style="margin:auto"><h3>Select a conversation</h3><p>Choose a conversation from the list to view messages.</p></div>`}
          </div>
        </div>`;

      container.querySelectorAll("[data-conv]").forEach(btn => {
        btn.addEventListener("click", () => selectConversation(btn.dataset.conv));
      });
      container.querySelector("#bk-chat-back")?.addEventListener("click", () => {
        activeId = null;
        render();
      });

      const form = container.querySelector("#bk-chat-form");
      if (form) {
        form.addEventListener("submit", async ev => {
          ev.preventDefault();
          const input = form.querySelector("input[name=body]");
          const sendBtn = form.querySelector("button[type=submit]");
          const text = (input.value || "").trim();
          if (!text) {
            BK.toast("Please enter a message.");
            input.focus();
            return;
          }
          sendBtn.disabled = true;
          try {
            const res = await BK_ACCOUNT_API.sendMessage(active.id, text);
            input.value = "";
            if (res && res.message) {
              appendMessage(res.message, true);
              updateConversationPreview(active.id, res.message.body, res.message.createdAt, true);
            }
          } catch (err) {
            BK.toast(err.message || "Could not send message.");
          }
          sendBtn.disabled = false;
          input.focus();
        });
      }

      const msgsEl = container.querySelector("#bk-chat-msgs");
      if (msgsEl) msgsEl.scrollTop = msgsEl.scrollHeight;
    }

    function renderThread(c) {
      const prop = c.property || {};
      const other = c.counterpart || {};
      let bodyHtml = "";
      if (loadingMsgs) bodyHtml = `<p style="color:var(--mu);text-align:center">Loading messages…</p>`;
      else if (msgError) bodyHtml = `<div class="notice bad">${e(msgError)}</div>`;
      else if (!messages.length) bodyHtml = `<p style="color:var(--mu);text-align:center">No messages yet. Say hello!</p>`;
      else {
        bodyHtml = messages.map(m => `
          <div class="bk-msg ${m.isMine ? "mine" : ""}">
            <div>${e(m.body)}</div>
            <span class="bk-msg-time">${e(fmtTime(m.createdAt))}${m.isMine ? (m.readAt ? " · Seen" : " · Sent") : ""}</span>
          </div>`).join("");
      }

      return `
        <div class="bk-chat-head">
          <button type="button" class="btn outline sm bk-chat-back" id="bk-chat-back">← Back</button>
          <img class="bk-chat-thumb" src="${e(prop.thumbnail || PLACEHOLDER_THUMB)}" alt="">
          <div class="bk-chat-meta">
            <div class="bk-chat-top">
              <strong>${e(other.name || "User")} ${other.verified ? BK.badge("✓ Verified", "ok") : ""}</strong>
            </div>
            <div class="bk-chat-sub">${e(prop.title || "Property")}${prop.rent ? ` · ${BK.taka(prop.rent)}/mo` : ""}</div>
          </div>
        </div>
        <div class="bk-chat-msgs" id="bk-chat-msgs" aria-live="polite">${bodyHtml}</div>
        <form class="bk-chat-form" id="bk-chat-form" novalidate>
          <input type="text" name="body" maxlength="2000" placeholder="Write a message…" aria-label="Message" autocomplete="off" required>
          <button type="submit" class="btn sm">Send</button>
        </form>`;
    }

    function appendMessage(msg, isMineOverride) {
      if (messages.some(m => String(m.id) === String(msg.id))) return;
      const item = isMineOverride !== undefined ? { ...msg, isMine: isMineOverride } : msg;
      messages.push(item);
      const msgsEl = container.querySelector("#bk-chat-msgs");
      if (msgsEl) {
        render();
      }
    }

    function updateConversationPreview(convId, text, at, resetUnread) {
      const idx = conversations.findIndex(c => String(c.id) === String(convId));
      if (idx === -1) {
        refreshConversations();
        return;
      }
      const c = { ...conversations[idx], lastMessageText: text.slice(0, 300), lastMessageAt: at || new Date().toISOString() };
      if (resetUnread) c.unreadCount = 0;
      conversations.splice(idx, 1);
      conversations.unshift(c);
      render();
    }

    async function selectConversation(id) {
      if (socket && activeId && activeId !== id) socket.emit("chat:leave", activeId);
      activeId = id;
      loadingMsgs = true;
      msgError = "";
      messages = [];
      render();
      try {
        const res = await BK_ACCOUNT_API.getMessages(id);
        if (activeId !== id) return;
        messages = res.messages || [];
        loadingMsgs = false;
        const conv = conversations.find(c => String(c.id) === String(id));
        if (conv && conv.unreadCount > 0) {
          conv.unreadCount = 0;
          BK_ACCOUNT_API.markConversationRead(id).catch(() => {});
        } else {
          // Ensure any unread messages from the counterpart are marked read.
          if (messages.some(m => !m.isMine && !m.readAt)) {
            BK_ACCOUNT_API.markConversationRead(id).catch(() => {});
          }
        }
        if (socket) socket.emit("chat:join", id);
        render();
      } catch (err) {
        if (activeId !== id) return;
        loadingMsgs = false;
        msgError = err.message || "Could not load messages.";
        render();
      }
    }

    async function refreshConversations() {
      loadingList = !conversations.length;
      listError = "";
      render();
      try {
        const res = await BK_ACCOUNT_API.getConversations();
        conversations = res.items || [];
        loadingList = false;
        if (!activeId && conversations.length && window.innerWidth >= 800) {
          activeId = conversations[0].id;
        }
        render();
        if (activeId && conversations.some(c => String(c.id) === String(activeId))) {
          await selectConversation(activeId);
        }
      } catch (err) {
        loadingList = false;
        listError = err.message || "Could not load conversations.";
        render();
      }
    }

    async function connectRealtime() {
      const ioLib = await loadSocketScript();
      if (!ioLib) return;
      const base = (window.BK_CONFIG && window.BK_CONFIG.SOCKET_BASE) || "";
      if (!base) return;
      socket = ioLib(base, { withCredentials: true });
      socket.on("connect", () => {
        if (activeId) socket.emit("chat:join", activeId);
      });
      socket.on("chat:message", payload => {
        if (!payload || !payload.conversationId || !payload.message) return;
        const cid = String(payload.conversationId);
        const msg = payload.message;
        const conv = conversations.find(c => String(c.id) === cid);
        const otherId = conv && conv.counterpart ? String(conv.counterpart.id) : null;
        const isMine = otherId ? String(msg.senderId) !== otherId : false;

        if (String(activeId) === cid) {
          if (!messages.some(m => String(m.id) === String(msg.id))) {
            messages.push({ ...msg, isMine });
            if (!isMine) BK_ACCOUNT_API.markConversationRead(cid).catch(() => {});
          }
          updateConversationPreview(cid, msg.body, msg.createdAt, true);
        } else {
          if (conv) {
            conv.unreadCount = (conv.unreadCount || 0) + (isMine ? 0 : 1);
            updateConversationPreview(cid, msg.body, msg.createdAt, false);
          } else {
            refreshConversations();
          }
        }
      });
      socket.on("chat:read", payload => {
        if (!payload || String(payload.conversationId) !== String(activeId)) return;
        let changed = false;
        messages = messages.map(m => {
          if (m.isMine && !m.readAt) { changed = true; return { ...m, readAt: payload.readAt }; }
          return m;
        });
        if (changed) render();
      });
    }

    refreshConversations();
    connectRealtime();

    return {
      refresh: refreshConversations,
      openConversation: selectConversation
    };
  }

  return { mount };
})();
