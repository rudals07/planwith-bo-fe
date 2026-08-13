const TOKEN_KEY = "planwith_bo_token";
const DEMO_KEY = "planwith_bo_demo";
const NAME_KEY = "planwith_bo_name";

const token = sessionStorage.getItem(TOKEN_KEY);
if (!token) {
  window.location.replace("/");
}

const demoMode = sessionStorage.getItem(DEMO_KEY) === "1";
document.getElementById("admin-name").textContent =
  sessionStorage.getItem(NAME_KEY) || (demoMode ? "demo-admin" : "admin");

const titles = {
  dashboard: ["대시보드", "요약 현황"],
  users: ["회원", "등급별 회원 조회"],
  stories: ["스토리", "콘텐츠 목록"],
  chat: ["채팅", "대화 모니터링 · 관리자 메모"],
  banned: ["금칙어", "금칙어 관리"],
};

let selectedGradeId = "";
let gradesCache = [];
let selectedChatRoomId = "";
const CHAT_NOTES_KEY = "planwith_bo_chat_notes";

const demo = {
  revenue: { todayAmount: 128000, monthAmount: 2450000, totalAmount: 18920000 },
  grades: [
    { gradeId: 1, gradeCode: "ROOKIE", gradeName: "루키", gradeLevel: 1, memberCount: 1 },
    { gradeId: 2, gradeCode: "LEAF", gradeName: "리프", gradeLevel: 2, memberCount: 1 },
    { gradeId: 3, gradeCode: "TRAVELER", gradeName: "트래블러", gradeLevel: 3, memberCount: 1 },
    { gradeId: 4, gradeCode: "EXPLORER", gradeName: "익스플로러", gradeLevel: 4, memberCount: 0 },
    { gradeId: 5, gradeCode: "ADVENTURER", gradeName: "어드벤처러", gradeLevel: 5, memberCount: 0 },
    { gradeId: 6, gradeCode: "MASTER", gradeName: "마스터", gradeLevel: 6, memberCount: 0 },
  ],
  users: [
    { id: "u-1001", nickname: "여행러버", email: "travel@example.com", gradeName: "ROOKIE", status: "ACTIVE", createdAt: "2026-08-01" },
    { id: "u-1002", nickname: "도쿄행", email: "tokyo@example.com", gradeName: "LEAF", status: "ACTIVE", createdAt: "2026-08-05" },
    { id: "u-1003", nickname: "일시정지유저", email: "pause@example.com", gradeName: "TRAVELER", status: "SUSPENDED", createdAt: "2026-07-20" },
  ],
  stories: [
    { id: 11, authorNickname: "여행러버", preview: "시부야에서 보낸 하루", status: "PUBLIC", createdAt: "2026-08-10" },
    { id: 12, authorNickname: "도쿄행", preview: "아사쿠사 산책 코스", status: "PUBLIC", createdAt: "2026-08-11" },
  ],
  banned: [
    { id: 1, word: "비속어A" },
    { id: 2, word: "스팸문구" },
  ],
  chats: [
    {
      id: "c-101",
      title: "여행러버 ↔ 도쿄행",
      lastMessage: "내일 시부야에서 봐요!",
      updatedAt: "2026-08-13 10:12",
      status: "NORMAL",
      members: ["여행러버", "도쿄행"],
      messages: [
        { id: 1, from: "여행러버", text: "안녕하세요! 일정 공유해도 될까요?", at: "10:01", side: "them" },
        { id: 2, from: "도쿄행", text: "네, 좋아요. 내일 시부야 어때요?", at: "10:05", side: "me" },
        { id: 3, from: "여행러버", text: "내일 시부야에서 봐요!", at: "10:12", side: "them" },
      ],
    },
    {
      id: "c-102",
      title: "일시정지유저 ↔ 고객센터",
      lastMessage: "환불 문의드립니다.",
      updatedAt: "2026-08-12 18:40",
      status: "REPORTED",
      members: ["일시정지유저", "고객센터"],
      messages: [
        { id: 1, from: "일시정지유저", text: "결제 취소가 안 됩니다.", at: "18:20", side: "them" },
        { id: 2, from: "고객센터", text: "주문번호를 알려주세요.", at: "18:30", side: "me" },
        { id: 3, from: "일시정지유저", text: "환불 문의드립니다.", at: "18:40", side: "them" },
      ],
    },
    {
      id: "c-103",
      title: "모임채팅 · 오사카 3박",
      lastMessage: "집합 장소 확정했어요.",
      updatedAt: "2026-08-11 09:15",
      status: "NORMAL",
      members: ["여행러버", "리프유저", "마스터킴"],
      messages: [
        { id: 1, from: "마스터킴", text: "집합 장소 확정했어요.", at: "09:15", side: "them" },
        { id: 2, from: "리프유저", text: "좋아요!", at: "09:16", side: "me" },
      ],
    },
  ],
};

function money(n) {
  return `${Number(n || 0).toLocaleString("ko-KR")}원`;
}

async function api(path, options = {}) {
  if (demoMode) throw new Error("demo");
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token && !String(token).startsWith("demo-")) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(path, { ...options, headers });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.success === false) {
    throw new Error(json?.message || `요청 실패 (${res.status})`);
  }
  return json?.data;
}

function setPage(page) {
  document.querySelectorAll(".page").forEach((el) => el.classList.add("is-hidden"));
  document.getElementById(`page-${page}`)?.classList.remove("is-hidden");
  document.querySelectorAll(".side__nav button").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.page === page);
  });
  const [t, s] = titles[page] || ["", ""];
  document.getElementById("page-title").textContent = t;
  document.getElementById("page-sub").textContent = s;
  if (page === "dashboard") loadDashboard();
  if (page === "users") loadUsers();
  if (page === "stories") loadStories();
  if (page === "chat") loadChat();
  if (page === "banned") loadBanned();
}

async function loadDashboard() {
  const apiEl = document.getElementById("stat-api");
  try {
    const data = await api("/api/admin/dashboard/revenue");
    document.getElementById("stat-today").textContent = money(data.todayAmount ?? data.today);
    document.getElementById("stat-month").textContent = money(data.monthAmount ?? data.month);
    document.getElementById("stat-total").textContent = money(data.totalAmount ?? data.total);
    apiEl.textContent = "BO 연결됨";
    apiEl.style.color = "var(--ok)";
  } catch {
    document.getElementById("stat-today").textContent = money(demo.revenue.todayAmount);
    document.getElementById("stat-month").textContent = money(demo.revenue.monthAmount);
    document.getElementById("stat-total").textContent = money(demo.revenue.totalAmount);
    apiEl.textContent = demoMode ? "데모 모드" : "샘플 표시";
    apiEl.style.color = "var(--muted)";
  }
}

function renderGradeBar() {
  const bar = document.getElementById("grade-bar");
  if (!bar) return;
  const total = gradesCache.reduce((s, g) => s + Number(g.memberCount || 0), 0);
  const chips = [
    { id: "", label: "전체", count: total },
    ...gradesCache.map((g) => ({
      id: String(g.gradeId),
      label: g.gradeName || g.gradeCode,
      count: g.memberCount || 0,
    })),
  ];
  bar.innerHTML = chips
    .map(
      (c) => `
      <button type="button" class="grade-chip ${String(selectedGradeId) === String(c.id) ? "is-active" : ""}" data-grade-id="${c.id}">
        ${c.label}<em>${c.count}</em>
      </button>`
    )
    .join("");
}

async function loadGrades() {
  try {
    gradesCache = (await api("/api/admin/grades")) || [];
  } catch {
    gradesCache = demo.grades;
  }
  renderGradeBar();
}

async function loadUsers() {
  await loadGrades();
  const q = (document.getElementById("user-q").value || "").toLowerCase();
  let list = demo.users;
  try {
    const qs = new URLSearchParams({ page: "0", size: "100" });
    if (selectedGradeId) qs.set("gradeId", selectedGradeId);
    const page = await api(`/api/admin/users?${qs}`);
    list = page?.content || page || [];
  } catch {
    list = demo.users.filter((u) => {
      if (!selectedGradeId) return true;
      const g = gradesCache.find((x) => String(x.gradeId) === String(selectedGradeId));
      return g && (u.gradeName === g.gradeCode || u.gradeName === g.gradeName);
    });
  }

  const body = document.getElementById("users-body");
  const empty = document.getElementById("users-empty");
  body.innerHTML = "";
  const rows = list.filter(
    (u) =>
      !q ||
      [u.nickname, u.email, u.id, u.userId, u.gradeName].some((v) =>
        String(v || "").toLowerCase().includes(q)
      )
  );
  if (empty) empty.hidden = rows.length > 0;
  rows.forEach((u) => {
    const tr = document.createElement("tr");
    const bad = String(u.status || "").includes("SUSPEND");
    tr.innerHTML = `
      <td>${u.id ?? u.userId ?? "—"}</td>
      <td>${u.nickname ?? "—"}</td>
      <td>${u.email ?? "—"}</td>
      <td><span class="badge">${u.gradeName ?? "—"}</span></td>
      <td><span class="badge ${bad ? "bad" : "ok"}">${u.status ?? "—"}</span></td>
      <td>${u.createdAt ? String(u.createdAt).slice(0, 10) : "—"}</td>`;
    body.appendChild(tr);
  });
}

async function loadStories() {
  let list = demo.stories;
  try {
    const page = await api("/api/admin/stories?page=0&size=50");
    list = page?.content || page || [];
  } catch { /* demo */ }
  const body = document.getElementById("stories-body");
  body.innerHTML = "";
  list.forEach((s) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${s.id ?? "—"}</td>
      <td>${s.authorNickname ?? "—"}</td>
      <td>${s.preview ?? s.title ?? "—"}</td>
      <td><span class="badge">${s.status ?? "—"}</span></td>
      <td>${s.createdAt ? String(s.createdAt).slice(0, 10) : "—"}</td>`;
    body.appendChild(tr);
  });
}

async function loadBanned() {
  let list = [...demo.banned];
  try {
    list = (await api("/api/admin/banned-words")) || [];
  } catch { /* demo */ }
  const body = document.getElementById("banned-body");
  body.innerHTML = "";
  list.forEach((w) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${w.id ?? "—"}</td>
      <td>${w.word ?? "—"}</td>
      <td><div class="row-actions"><button type="button" class="danger" data-id="${w.id}">삭제</button></div></td>`;
    body.appendChild(tr);
  });
}

function getChatNotes() {
  try {
    return JSON.parse(localStorage.getItem(CHAT_NOTES_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveChatNote(roomId, text) {
  const notes = getChatNotes();
  if (!notes[roomId]) notes[roomId] = [];
  notes[roomId].push({
    id: Date.now(),
    from: "admin",
    text,
    at: new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }),
    side: "admin",
  });
  localStorage.setItem(CHAT_NOTES_KEY, JSON.stringify(notes));
}

function getChatRooms() {
  // 채팅 API 미연동 — 데모 데이터 + 로컬 메모
  return demo.chats.map((room) => {
    const notes = getChatNotes()[room.id] || [];
    return { ...room, messages: [...room.messages, ...notes] };
  });
}

function renderChatRooms() {
  const q = (document.getElementById("chat-room-q")?.value || "").toLowerCase();
  const list = document.getElementById("chat-room-list");
  if (!list) return;
  const rooms = getChatRooms().filter(
    (r) =>
      !q ||
      [r.title, r.lastMessage, ...(r.members || [])].some((v) => String(v || "").toLowerCase().includes(q))
  );
  list.innerHTML = rooms
    .map(
      (r) => `
      <button type="button" class="chat-room ${selectedChatRoomId === r.id ? "is-active" : ""}" data-room-id="${r.id}">
        <strong>${r.title}</strong>
        <span>${r.lastMessage}</span>
        <span>${r.updatedAt} · ${r.status === "REPORTED" ? "신고" : "정상"}</span>
      </button>`
    )
    .join("");
}

function renderChatThread(roomId) {
  const room = getChatRooms().find((r) => r.id === roomId);
  const box = document.getElementById("chat-messages");
  const title = document.getElementById("chat-room-title");
  const meta = document.getElementById("chat-room-meta");
  const status = document.getElementById("chat-room-status");
  const form = document.getElementById("form-chat-note");
  if (!room) {
    title.textContent = "대화를 선택하세요";
    meta.textContent = "신고/모니터링용 미리보기";
    status.textContent = "—";
    box.innerHTML = `<p class="empty">왼쪽에서 대화를 선택하세요.</p>`;
    form.hidden = true;
    return;
  }
  title.textContent = room.title;
  meta.textContent = `참여자: ${(room.members || []).join(", ")}`;
  status.textContent = room.status === "REPORTED" ? "신고됨" : "정상";
  status.className = `badge ${room.status === "REPORTED" ? "bad" : "ok"}`;
  form.hidden = false;
  box.innerHTML = room.messages
    .map(
      (m) => `
      <div class="chat-bubble ${m.side || "them"}">
        ${m.side === "admin" ? `[관리자 메모] ${m.text}` : `<b>${m.from}</b><br>${m.text}`}
        <small>${m.at || ""}</small>
      </div>`
    )
    .join("");
  box.scrollTop = box.scrollHeight;
}

function loadChat() {
  if (!selectedChatRoomId && demo.chats[0]) selectedChatRoomId = demo.chats[0].id;
  renderChatRooms();
  renderChatThread(selectedChatRoomId);
}

document.querySelectorAll(".side__nav button").forEach((btn) => {
  btn.addEventListener("click", () => setPage(btn.dataset.page));
});

document.getElementById("btn-logout").addEventListener("click", () => {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(DEMO_KEY);
  sessionStorage.removeItem(NAME_KEY);
  window.location.replace("/");
});

document.getElementById("btn-users-reload")?.addEventListener("click", loadUsers);
document.getElementById("btn-stories-reload")?.addEventListener("click", loadStories);
document.getElementById("btn-banned-reload")?.addEventListener("click", loadBanned);
document.getElementById("btn-chat-reload")?.addEventListener("click", loadChat);
document.getElementById("chat-room-q")?.addEventListener("input", renderChatRooms);
document.getElementById("chat-room-list")?.addEventListener("click", (e) => {
  const btn = e.target.closest(".chat-room");
  if (!btn) return;
  selectedChatRoomId = btn.dataset.roomId;
  renderChatRooms();
  renderChatThread(selectedChatRoomId);
});
document.getElementById("form-chat-note")?.addEventListener("submit", (e) => {
  e.preventDefault();
  const text = e.target.note.value.trim();
  if (!text || !selectedChatRoomId) return;
  saveChatNote(selectedChatRoomId, text);
  e.target.reset();
  renderChatThread(selectedChatRoomId);
});
document.getElementById("user-q")?.addEventListener("input", loadUsers);
document.getElementById("grade-bar")?.addEventListener("click", (e) => {
  const chip = e.target.closest(".grade-chip");
  if (!chip) return;
  selectedGradeId = chip.dataset.gradeId || "";
  renderGradeBar();
  loadUsers();
});

document.getElementById("form-banned")?.addEventListener("submit", async (e) => {
  e.preventDefault();
  const word = e.target.word.value.trim();
  if (!word) return;
  if (demoMode) {
    demo.banned.push({ id: Date.now(), word });
    e.target.reset();
    loadBanned();
    return;
  }
  try {
    await api("/api/admin/banned-words", { method: "POST", body: JSON.stringify({ word }) });
    e.target.reset();
    loadBanned();
  } catch (ex) {
    alert(ex.message);
  }
});

document.getElementById("banned-body")?.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-id]");
  if (!btn) return;
  if (demoMode) {
    const i = demo.banned.findIndex((w) => String(w.id) === String(btn.dataset.id));
    if (i >= 0) demo.banned.splice(i, 1);
    loadBanned();
    return;
  }
  try {
    await api(`/api/admin/banned-words/${btn.dataset.id}`, { method: "DELETE" });
    loadBanned();
  } catch (ex) {
    alert(ex.message);
  }
});

setPage("dashboard");
