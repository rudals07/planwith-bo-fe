const TOKEN_KEY = "planwith_bo_token";
const NAME_KEY = "planwith_bo_name";

const token = sessionStorage.getItem(TOKEN_KEY);
if (!token || String(token).startsWith("demo-")) {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(NAME_KEY);
  sessionStorage.removeItem("planwith_bo_demo");
  window.location.replace("/");
}

document.getElementById("admin-name").textContent =
  sessionStorage.getItem(NAME_KEY) || "admin";

const titles = {
  dashboard: ["대시보드", "사이트 수입 정보"],
  users: ["회원", "회원 리스트 정보"],
  stories: ["스토리", "콘텐츠 목록"],
  comments: ["댓글", "댓글 목록"],
  chat: ["채팅", "대화 모니터링 · 관리자 메모"],
  banned: ["금칙어", "금칙어 관리"],
};

let selectedGradeId = "";
let gradesCache = [];
let selectedChatRoomId = "";
let chatRoomsCache = [];
let storiesCache = [];
let commentsCache = [];
let revenueGroupBy = "day";
let lastRevenuePeriods = [];
let suspendTarget = null;
let suspendPeriod = "1";
let userDetailCache = null;
let paymentTotalFilter = "all";
const CHAT_NOTES_KEY = "planwith_bo_chat_notes";

function formatJoinDate(value) {
  if (!value) return "0000-00-00";
  const s = String(value);
  return s.length >= 10 ? s.slice(0, 10) : s;
}

function labelMemberType(type, loginType) {
  if (type === "SOCIAL" || (loginType && loginType !== "LOCAL")) return "소셜 회원";
  return "일반 회원";
}

function labelMemberStatus(status) {
  switch (String(status || "").toUpperCase()) {
    case "ACTIVE":
      return "활동";
    case "SUSPENDED":
      return "활동 정지";
    case "DELETED":
      return "탈퇴";
    case "INACTIVE":
      return "비활성";
    default:
      return status || "—";
  }
}

function statusBadgeClass(status) {
  const s = String(status || "").toUpperCase();
  if (s === "SUSPENDED") return "bad";
  if (s === "DELETED" || s === "INACTIVE") return "";
  return "ok";
}

function money(n) {
  return `${Number(n || 0).toLocaleString("ko-KR")}원`;
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const res = await fetch(path, { ...options, headers });
  const json = await res.json().catch(() => null);
  if (res.status === 401) {
    sessionStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(NAME_KEY);
    window.location.replace("/");
    throw new Error("로그인이 필요합니다. 다시 로그인해 주세요.");
  }
  if (!res.ok || json?.success === false) {
    throw new Error(json?.message || json?.error?.message || `요청 실패 (${res.status})`);
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
  const titleEl = document.getElementById("page-title");
  if (titleEl) titleEl.textContent = t;
  document.getElementById("page-sub").textContent = s;
  if (page === "dashboard") loadDashboard();
  if (page === "users") loadUsers();
  if (page === "stories") loadStories();
  if (page === "comments") loadComments();
  if (page === "chat") loadChat();
  if (page === "banned") loadBanned();
}

function isReported(item) {
  if (!item) return false;
  if (item.reported === true) return true;
  const status = String(item.status || "").toUpperCase();
  return status === "REPORTED" || Number(item.reportCount || 0) > 0;
}

function reportBadgeHtml(item) {
  if (!isReported(item)) return "";
  const count = Number(item.reportCount || 0);
  const label = count > 0 ? `신고 ${count}` : "신고";
  return `<span class="report-badge is-blink" title="신고된 콘텐츠">${label}</span>`;
}

function itemStatusKey(item) {
  return isReported(item) ? "REPORTED" : "NORMAL";
}

function sortByDate(list, direction, field = "createdAt") {
  const dir = direction === "asc" ? 1 : -1;
  return [...list].sort((a, b) => {
    const av = String(a?.[field] || a?.updatedAt || "");
    const bv = String(b?.[field] || b?.updatedAt || "");
    if (av === bv) return 0;
    return av > bv ? dir : -dir;
  });
}

function matchesQuery(item, q, fields) {
  if (!q) return true;
  return fields.some((f) => String(item?.[f] ?? "").toLowerCase().includes(q));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatDateTime(value) {
  if (!value) return "영구";
  const s = String(value);
  return s.length >= 16 ? s.slice(0, 16).replace("T", " ") : s;
}

function toLocalDateTimeParam(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function resolveSuspendedUntil() {
  if (suspendPeriod === "permanent") return null;
  if (suspendPeriod === "custom") {
    const raw = document.getElementById("suspend-until")?.value;
    if (!raw) return undefined;
    return toLocalDateTimeParam(new Date(raw));
  }
  const days = Number(suspendPeriod);
  if (!Number.isFinite(days) || days <= 0) return null;
  const until = new Date();
  until.setDate(until.getDate() + days);
  return toLocalDateTimeParam(until);
}

function userApiKey(user) {
  return user?.memberUuid || user?.id || (user?.memberNo != null ? String(user.memberNo) : "");
}

function showSuspendError(msg) {
  const err = document.getElementById("suspend-error");
  if (!err) return;
  err.textContent = msg || "";
  err.hidden = !msg;
}

function openSuspendModal(user) {
  suspendTarget = user;
  suspendPeriod = "1";
  const modal = document.getElementById("suspend-modal");
  const reason = document.getElementById("suspend-reason");
  const until = document.getElementById("suspend-until");
  const confirmBtn = document.getElementById("btn-suspend-confirm");
  showSuspendError("");
  if (reason) reason.value = "";
  if (until) {
    until.value = "";
    until.classList.add("is-hidden");
  }
  if (confirmBtn) confirmBtn.disabled = false;
  document.querySelectorAll("#suspend-period button").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.days === "1");
  });
  const target = document.getElementById("suspend-modal-target");
  if (target) {
    target.textContent = `${user.nickname || "회원"} · 회원번호 ${user.memberNo ?? "—"}`;
  }
  if (modal) {
    modal.hidden = false;
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
  }
  reason?.focus();
}

function closeSuspendModal() {
  suspendTarget = null;
  const modal = document.getElementById("suspend-modal");
  if (modal) {
    modal.classList.remove("is-open");
    modal.hidden = true;
    modal.setAttribute("aria-hidden", "true");
  }
  showSuspendError("");
}

async function confirmSuspend() {
  const memberNo = suspendTarget?.memberNo != null ? Number(suspendTarget.memberNo) : null;
  const memberUuid = suspendTarget?.memberUuid || suspendTarget?.id || null;
  if (memberNo == null && !memberUuid) {
    showSuspendError("대상 회원을 찾을 수 없습니다. 목록을 새로고침해 주세요.");
    return;
  }
  const reason = (document.getElementById("suspend-reason")?.value || "").trim();
  if (!reason) {
    showSuspendError("정지 사유를 입력해주세요.");
    document.getElementById("suspend-reason")?.focus();
    return;
  }
  const suspendedUntil = resolveSuspendedUntil();
  if (suspendedUntil === undefined) {
    showSuspendError("정지 종료 일시를 선택해주세요.");
    return;
  }
  const confirmBtn = document.getElementById("btn-suspend-confirm");
  if (confirmBtn) confirmBtn.disabled = true;
  showSuspendError("");
  try {
    const payload = {
      memberNo: Number.isFinite(memberNo) ? memberNo : null,
      memberUuid: memberUuid || null,
      reason,
    };
    if (suspendedUntil) payload.suspendedUntil = suspendedUntil;
    await api("/api/admin/users/suspend", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    closeSuspendModal();
    const statusEl = document.getElementById("users-status");
    if (statusEl) {
      statusEl.textContent = "계정을 정지했습니다. 해당 회원은 로그인·이용이 제한됩니다.";
      statusEl.style.color = "var(--ok)";
    }
    await loadUsers();
  } catch (ex) {
    showSuspendError(ex.message || "계정 정지에 실패했습니다.");
    if (confirmBtn) confirmBtn.disabled = false;
  }
}

function renderUserActions(u) {
  const st = String(u.status || "").toUpperCase();
  const key = escapeHtml(userApiKey(u));
  const memberNo = u.memberNo != null ? String(u.memberNo) : "";
  if (st === "ACTIVE" || !st) {
    return `<div class="row-actions">
      <button type="button" class="danger btn-suspend" data-action="suspend" data-key="${key}" data-member-no="${escapeHtml(memberNo)}">계정 정지</button>
    </div>`;
  }
  if (st === "SUSPENDED") {
    const untilLabel = u.suspendedUntil == null ? "영구" : formatDateTime(u.suspendedUntil);
    const reason = u.suspendReason ? `<div class="muted tiny">사유: ${escapeHtml(u.suspendReason)}</div>` : "";
    return `<div class="row-actions row-actions--stack">
      <button type="button" class="ghost btn-unsuspend" data-action="unsuspend" data-key="${key}" data-member-no="${escapeHtml(memberNo)}">정지 해제</button>
      <div class="muted tiny">만료: ${escapeHtml(untilLabel)}</div>
      ${reason}
    </div>`;
  }
  return `<span class="muted">—</span>`;
}

function groupCaption(group) {
  return { day: "일간 수입 추이", month: "월간 수입 추이", year: "연간 수입 추이" }[group] || "수입 추이";
}

function drawRevenueChart(periods) {
  const canvas = document.getElementById("revenue-chart");
  const empty = document.getElementById("chart-empty");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const cssW = canvas.clientWidth || 960;
  const cssH = 280;
  canvas.width = Math.floor(cssW * dpr);
  canvas.height = Math.floor(cssH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssW, cssH);

  const rows = (periods || []).map((p) => ({
    period: String(p.period || ""),
    amount: Number(p.amount || 0),
  }));

  if (!rows.length || rows.every((r) => r.amount === 0)) {
    empty.hidden = false;
    canvas.style.opacity = "0.25";
  } else {
    empty.hidden = true;
    canvas.style.opacity = "1";
  }

  const pad = { t: 24, r: 16, b: 40, l: 56 };
  const w = cssW - pad.l - pad.r;
  const h = cssH - pad.t - pad.b;
  const max = Math.max(1, ...rows.map((r) => r.amount));

  // axes
  ctx.strokeStyle = "#d7dee8";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(pad.l, pad.t);
  ctx.lineTo(pad.l, pad.t + h);
  ctx.lineTo(pad.l + w, pad.t + h);
  ctx.stroke();

  // grid + y labels
  ctx.fillStyle = "#6b7a90";
  ctx.font = "12px Pretendard, sans-serif";
  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (h * i) / 4;
    const val = Math.round(max * (1 - i / 4));
    ctx.strokeStyle = "#eef2f7";
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(pad.l + w, y);
    ctx.stroke();
    ctx.fillText(val.toLocaleString("ko-KR"), 8, y + 4);
  }

  if (!rows.length) return;

  const gap = 8;
  const barW = Math.max(8, Math.min(48, (w - gap * (rows.length + 1)) / rows.length));
  const step = w / rows.length;

  rows.forEach((r, i) => {
    const bh = (r.amount / max) * h;
    const x = pad.l + step * i + (step - barW) / 2;
    const y = pad.t + h - bh;
    const grad = ctx.createLinearGradient(0, y, 0, pad.t + h);
    grad.addColorStop(0, "#3b82f6");
    grad.addColorStop(1, "#1d4ed8");
    ctx.fillStyle = grad;
    ctx.beginPath();
    const rr = 4;
    ctx.moveTo(x, y + rr);
    ctx.arcTo(x, y, x + barW, y, rr);
    ctx.arcTo(x + barW, y, x + barW, y + rr, rr);
    ctx.lineTo(x + barW, pad.t + h);
    ctx.lineTo(x, pad.t + h);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#6b7a90";
    ctx.save();
    ctx.translate(x + barW / 2, pad.t + h + 14);
    const label = r.period.length > 7 ? r.period.slice(-5) : r.period;
    ctx.textAlign = "center";
    ctx.fillText(label, 0, 0);
    ctx.restore();
  });
}

async function loadDashboard() {
  const statusEl = document.getElementById("dash-status");
  const caption = document.getElementById("chart-caption");
  document.querySelectorAll("#revenue-group button").forEach((b) => {
    b.classList.toggle("is-active", b.dataset.group === revenueGroupBy);
  });
  if (caption) caption.textContent = groupCaption(revenueGroupBy);
  if (statusEl) {
    statusEl.textContent = "수입 정보를 가져오는 중…";
    statusEl.style.color = "var(--muted)";
  }
  try {
    const data = await api(`/api/admin/dashboard/revenue?groupBy=${encodeURIComponent(revenueGroupBy)}`);
    document.getElementById("stat-total").textContent = money(data.totalRevenue ?? 0);
    document.getElementById("stat-today").textContent = money(data.todayRevenue ?? 0);
    document.getElementById("stat-month").textContent = money(data.monthRevenue ?? 0);
    document.getElementById("stat-year").textContent = money(data.yearRevenue ?? 0);
    lastRevenuePeriods = data.periods || [];
    drawRevenueChart(lastRevenuePeriods);
    if (statusEl) {
      statusEl.textContent = "수입 정보를 가져왔습니다.";
      statusEl.style.color = "var(--ok)";
    }
  } catch (ex) {
    document.getElementById("stat-total").textContent = "—";
    document.getElementById("stat-today").textContent = "—";
    document.getElementById("stat-month").textContent = "—";
    document.getElementById("stat-year").textContent = "—";
    lastRevenuePeriods = [];
    drawRevenueChart([]);
    if (statusEl) {
      statusEl.textContent = ex.message || "수입 정보를 가져오지 못했습니다.";
      statusEl.style.color = "var(--danger)";
    }
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
  } catch (ex) {
    gradesCache = [];
    console.error(ex);
  }
  renderGradeBar();
}

async function loadUsers() {
  await loadGrades();
  const q = (document.getElementById("user-q").value || "").trim().toLowerCase();
  const statusFilter = document.getElementById("user-status-filter")?.value || "";
  const typeFilter = document.getElementById("user-type-filter")?.value || "";
  const sortDir = document.getElementById("user-sort")?.value === "asc" ? "asc" : "desc";
  const body = document.getElementById("users-body");
  const empty = document.getElementById("users-empty");
  const statusEl = document.getElementById("users-status");
  body.innerHTML = "";
  if (statusEl) {
    statusEl.textContent = "회원 리스트를 불러오는 중…";
    statusEl.style.color = "var(--muted)";
  }

  let list = [];
  try {
    const qs = new URLSearchParams({
      page: "0",
      size: "100",
      sort: `createdAt,${sortDir}`,
    });
    if (selectedGradeId) qs.set("gradeId", selectedGradeId);
    if (statusFilter) qs.set("status", statusFilter);
    if (typeFilter) qs.set("memberType", typeFilter);
    const page = await api(`/api/admin/users?${qs}`);
    list = page?.content || page || [];
  } catch (ex) {
    if (empty) {
      empty.hidden = false;
      empty.textContent = ex.message || "회원 목록을 불러오지 못했습니다.";
    }
    if (statusEl) {
      statusEl.textContent = ex.message || "회원 리스트를 불러오지 못했습니다.";
      statusEl.style.color = "var(--danger)";
    }
    return;
  }

  const rows = list.filter((u) => {
    if (!q) return true;
    return String(u.nickname || "").toLowerCase().includes(q);
  });
  if (empty) {
    empty.textContent = q ? "해당 닉네임의 회원이 없습니다." : "회원이 없습니다.";
    empty.hidden = rows.length > 0;
  }
  rows.forEach((u) => {
    const tr = document.createElement("tr");
    const st = u.status;
    const userPayload = {
      memberUuid: u.memberUuid || u.id || null,
      memberNo: u.memberNo,
      nickname: u.nickname,
      status: u.status,
    };
    tr.dataset.user = JSON.stringify(userPayload);
    tr.classList.add("is-clickable");
    tr.innerHTML = `
      <td>${u.memberNo ?? "—"}</td>
      <td>${escapeHtml(u.nickname) || "—"}</td>
      <td>${escapeHtml(u.email) || "—"}</td>
      <td><span class="badge">${escapeHtml(u.gradeName) || "—"}</span></td>
      <td>${formatJoinDate(u.createdAt)}</td>
      <td>${labelMemberType(u.memberType, u.loginType)}</td>
      <td><span class="badge ${statusBadgeClass(st)}">${labelMemberStatus(st)}</span></td>
      <td>${renderUserActions({ ...u, ...userPayload })}</td>`;
    body.appendChild(tr);
  });
  if (statusEl) {
    statusEl.textContent = `회원 리스트를 불러왔습니다. (${rows.length}명)`;
    statusEl.style.color = "var(--ok)";
  }
}

function profileImageHtml(url) {
  const src = String(url || "").trim();
  if (!src) {
    return `<div class="user-detail__avatar is-empty" aria-hidden="true">사진 없음</div>`;
  }
  const safe = escapeHtml(src);
  return `<img class="user-detail__avatar" src="${safe}" alt="프로필" loading="lazy"
    onerror="this.replaceWith(Object.assign(document.createElement('div'),{className:'user-detail__avatar is-empty',textContent:'파일 없음'}))" />`;
}

function labelPaymentPath(path) {
  const p = String(path || "").toUpperCase();
  if (p === "EASY_PAY") return "간편 결제";
  if (p === "DIRECT") return "직접 등록";
  return path || "—";
}

function labelTokenStatus(status, balance) {
  const s = String(status || "").toUpperCase();
  if (s === "ACTIVE") return `활성 · ${Number(balance || 0).toLocaleString("ko-KR")} 토큰`;
  if (s === "NONE") return "지갑 없음";
  return `${status || "—"} · ${Number(balance || 0).toLocaleString("ko-KR")} 토큰`;
}

function paymentTotalByFilter(detail, filter) {
  switch (filter) {
    case "day":
      return detail.totalPaymentDay ?? 0;
    case "month":
      return detail.totalPaymentMonth ?? 0;
    case "year":
      return detail.totalPaymentYear ?? 0;
    default:
      return detail.totalPaymentAmount ?? 0;
  }
}

function paymentFilterLabel(filter) {
  return { all: "현재까지", day: "일별(오늘)", month: "월별(이번 달)", year: "년별(올해)" }[filter] || "현재까지";
}

function closeUserDetailModal() {
  const modal = document.getElementById("user-detail-modal");
  if (!modal) return;
  modal.classList.remove("is-open");
  modal.hidden = true;
  modal.setAttribute("aria-hidden", "true");
  userDetailCache = null;
}

function showUserDetailError(msg) {
  const el = document.getElementById("user-detail-error");
  if (!el) return;
  el.hidden = !msg;
  el.textContent = msg || "";
}

function renderUserDetail(detail) {
  userDetailCache = detail;
  const body = document.getElementById("user-detail-body");
  const statusEl = document.getElementById("user-detail-status");
  const sub = document.getElementById("user-detail-sub");
  if (!body) return;
  showUserDetailError("");
  if (statusEl) {
    statusEl.textContent = "회원 상세 정보를 불러왔습니다.";
    statusEl.style.color = "var(--ok)";
  }
  if (sub) {
    sub.textContent = `#${detail.memberNo ?? "—"} · ${detail.nickname || "회원"} · ${labelMemberStatus(detail.status)}`;
  }

  const terms = detail.optionalTermConsents || [];
  const payments = detail.paymentHistory || [];
  const following = detail.followingList || [];
  const reported = detail.reportedComments || [];
  const total = paymentTotalByFilter(detail, paymentTotalFilter);
  const avatar = profileImageHtml(detail.profileImage);

  body.hidden = false;
  body.innerHTML = `
    <div class="user-detail__profile">
      ${avatar}
      <dl class="user-detail__grid" style="flex:1">
        <div class="user-detail__item"><dt>닉네임</dt><dd>${escapeHtml(detail.nickname) || "—"}</dd></div>
        <div class="user-detail__item"><dt>이메일</dt><dd>${escapeHtml(detail.email) || "—"}</dd></div>
        <div class="user-detail__item"><dt>전화번호</dt><dd>${escapeHtml(detail.phone) || "—"}</dd></div>
        <div class="user-detail__item"><dt>회원 등급</dt><dd>${escapeHtml(detail.gradeName) || "—"}</dd></div>
        <div class="user-detail__item"><dt>현재 토큰 상황</dt><dd>${escapeHtml(labelTokenStatus(detail.tokenStatus, detail.tokenBalance))}</dd></div>
        <div class="user-detail__item"><dt>팔로워 수</dt><dd>${Number(detail.followerCount || 0).toLocaleString("ko-KR")}</dd></div>
        <div class="user-detail__item" style="grid-column:1/-1"><dt>프로필 소개글</dt><dd>${escapeHtml(detail.introduction) || "—"}</dd></div>
      </dl>
    </div>

    <section class="user-detail__section">
      <h3>선택 약관 동의 여부</h3>
      ${
        terms.length
          ? `<div class="term-checks">${terms
              .map(
                (t) => `<label><input type="checkbox" disabled ${t.agreed ? "checked" : ""} /> ${escapeHtml(t.title) || "선택 약관"}</label>`
              )
              .join("")}</div>`
          : `<p class="empty">선택 약관 정보가 없습니다.</p>`
      }
    </section>

    <section class="user-detail__section">
      <div class="user-detail__section-head">
        <h3>총 결제 금액</h3>
        <div class="seg" id="payment-total-filter" role="tablist" aria-label="총 결제 금액 필터">
          <button type="button" data-pay-filter="all" class="${paymentTotalFilter === "all" ? "is-active" : ""}">현재까지</button>
          <button type="button" data-pay-filter="day" class="${paymentTotalFilter === "day" ? "is-active" : ""}">일별</button>
          <button type="button" data-pay-filter="month" class="${paymentTotalFilter === "month" ? "is-active" : ""}">월별</button>
          <button type="button" data-pay-filter="year" class="${paymentTotalFilter === "year" ? "is-active" : ""}">년별</button>
        </div>
      </div>
      <p><strong>${money(total)}</strong> <span class="muted">(${paymentFilterLabel(paymentTotalFilter)})</span></p>
    </section>

    <section class="user-detail__section">
      <h3>결제 내역</h3>
      ${
        payments.length
          ? `<table class="detail-table">
              <thead><tr><th>일시</th><th>금액</th><th>결제 경로</th><th>상태</th></tr></thead>
              <tbody>
                ${payments
                  .map(
                    (p) => `<tr>
                      <td>${p.paidAt ? String(p.paidAt).replace("T", " ").slice(0, 16) : "—"}</td>
                      <td>${money(p.amount)}</td>
                      <td>${escapeHtml(labelPaymentPath(p.paymentPath))}</td>
                      <td>${escapeHtml(p.status) || "—"}</td>
                    </tr>`
                  )
                  .join("")}
              </tbody>
            </table>`
          : `<p class="empty">결제 내역이 없습니다.</p>`
      }
    </section>

    <section class="user-detail__section">
      <h3>멤버십</h3>
      <dl class="user-detail__grid">
        <div class="user-detail__item"><dt>멤버십 여부 (수익 신청)</dt><dd>${detail.membershipApplied ? "신청 완료" : "미신청"}</dd></div>
        <div class="user-detail__item"><dt>신청 가능 등급</dt><dd>${detail.membershipEligible ? "가능" : "불가"}</dd></div>
        <div class="user-detail__item"><dt>멤버십 수익</dt><dd>${money(detail.membershipRevenue)}</dd></div>
      </dl>
      <div class="detail-actions">
        <button type="button" data-detail-action="settle">정산</button>
        <button type="button" class="ghost" data-detail-action="nudge-email" ${detail.canNudgeMembership ? "" : "disabled"}>독촉 이메일</button>
        <button type="button" class="ghost" data-detail-action="nudge-sms" ${detail.canNudgeMembership ? "" : "disabled"}>독촉 문자</button>
      </div>
    </section>

    <section class="user-detail__section">
      <h3>팔로우 리스트 <span class="muted">(${following.length})</span></h3>
      ${
        following.length
          ? `<div class="follow-chips">${following
              .map((f) => `<span>${escapeHtml(f.nickname) || escapeHtml(f.memberUuid) || "—"}</span>`)
              .join("")}</div>`
          : `<p class="empty">팔로우한 회원이 없습니다.</p>`
      }
    </section>

    <section class="user-detail__section">
      <h3>신고 받은 댓글 리스트</h3>
      ${
        reported.length
          ? `<table class="detail-table">
              <thead><tr><th>내용</th><th>스토리</th><th>신고</th><th></th></tr></thead>
              <tbody>
                ${reported
                  .map(
                    (c) => `<tr>
                      <td>${escapeHtml(c.content) || "—"}</td>
                      <td>${escapeHtml(c.storyTitle) || "—"}</td>
                      <td>${Number(c.reportCount || 0)}</td>
                      <td>${
                        c.deletable
                          ? `<button type="button" class="danger" data-detail-action="delete-comment" data-comment-id="${c.id}">삭제</button>`
                          : `<span class="muted">—</span>`
                      }</td>
                    </tr>`
                  )
                  .join("")}
              </tbody>
            </table>`
          : `<p class="empty">신고 받은 댓글이 없습니다.</p>`
      }
    </section>
  `;
}

async function openUserDetail(userId) {
  const modal = document.getElementById("user-detail-modal");
  const body = document.getElementById("user-detail-body");
  const statusEl = document.getElementById("user-detail-status");
  if (!modal || !userId) return;
  paymentTotalFilter = "all";
  modal.hidden = false;
  modal.classList.add("is-open");
  modal.setAttribute("aria-hidden", "false");
  if (body) {
    body.hidden = true;
    body.innerHTML = "";
  }
  showUserDetailError("");
  if (statusEl) {
    statusEl.textContent = "회원 상세 정보를 불러오는 중…";
    statusEl.style.color = "var(--muted)";
  }
  try {
    const detail = await api(`/api/admin/users/${encodeURIComponent(userId)}`);
    renderUserDetail(detail || {});
  } catch (ex) {
    if (statusEl) {
      statusEl.textContent = "회원 상세 정보를 불러오지 못했습니다.";
      statusEl.style.color = "var(--danger)";
    }
    showUserDetailError(ex.message || "회원 상세 정보를 불러오지 못했습니다.");
  }
}

async function reloadUserDetail() {
  const id = userDetailCache?.id;
  if (!id) return;
  try {
    const detail = await api(`/api/admin/users/${encodeURIComponent(id)}`);
    renderUserDetail(detail || {});
  } catch (ex) {
    showUserDetailError(ex.message || "회원 상세 정보를 새로고침하지 못했습니다.");
  }
}

async function loadComments() {
  const body = document.getElementById("comments-body");
  const empty = document.getElementById("comments-empty");
  if (body) body.innerHTML = "";
  if (empty) {
    empty.hidden = true;
    empty.textContent = "댓글이 없습니다.";
  }
  try {
    const page = await api("/api/admin/comments?page=0&size=50");
    commentsCache = page?.content || page || [];
  } catch (ex) {
    commentsCache = [];
    if (empty) {
      empty.hidden = false;
      empty.textContent = ex.message || "댓글을 불러오지 못했습니다.";
    } else if (body) {
      body.innerHTML = `<tr><td colspan="5" class="empty">${ex.message || "댓글을 불러오지 못했습니다."}</td></tr>`;
    }
    return;
  }
  renderComments();
}

function renderComments() {
  const body = document.getElementById("comments-body");
  const empty = document.getElementById("comments-empty");
  if (!body) return;
  body.innerHTML = "";

  const q = (document.getElementById("comment-q")?.value || "").trim().toLowerCase();
  const status = document.getElementById("comment-status-filter")?.value || "";
  const sortDir = document.getElementById("comment-sort")?.value === "asc" ? "asc" : "desc";

  let list = sortByDate(commentsCache, sortDir, "createdAt").filter((c) => {
    if (status && itemStatusKey(c) !== status) return false;
    return matchesQuery(c, q, ["content", "authorNickname", "storyTitle"]);
  });

  if (!list.length) {
    const msg = status === "REPORTED" ? "신고된 댓글이 없습니다." : q ? "검색 결과가 없습니다." : "댓글이 없습니다.";
    if (empty) {
      empty.hidden = false;
      empty.textContent = msg;
    } else {
      body.innerHTML = `<tr><td colspan="5" class="empty">${msg}</td></tr>`;
    }
    return;
  }
  if (empty) empty.hidden = true;
  list.forEach((c) => {
    const tr = document.createElement("tr");
    if (isReported(c)) tr.classList.add("row-reported");
    tr.innerHTML = `
      <td>${c.id ?? "—"}</td>
      <td>${escapeHtml(c.authorNickname) || "—"}</td>
      <td><span class="cell-with-badge">${reportBadgeHtml(c)}<span>${escapeHtml(c.content) || "—"}</span></span></td>
      <td>${escapeHtml(c.storyTitle) || "—"}</td>
      <td>${c.createdAt ? String(c.createdAt).slice(0, 10) : "—"}</td>`;
    body.appendChild(tr);
  });
}

async function loadStories() {
  const body = document.getElementById("stories-body");
  body.innerHTML = "";
  try {
    const sortDir = document.getElementById("story-sort")?.value === "asc" ? "asc" : "desc";
    const page = await api(`/api/admin/stories?page=0&size=50&sort=createdAt,${sortDir}`);
    storiesCache = page?.content || page || [];
  } catch (ex) {
    storiesCache = [];
    body.innerHTML = `<tr><td colspan="5" class="empty">${ex.message || "스토리를 불러오지 못했습니다."}</td></tr>`;
    return;
  }
  renderStories();
}

function renderStories() {
  const body = document.getElementById("stories-body");
  if (!body) return;
  body.innerHTML = "";

  const q = (document.getElementById("story-q")?.value || "").trim().toLowerCase();
  const status = document.getElementById("story-status-filter")?.value || "";
  const sortDir = document.getElementById("story-sort")?.value === "asc" ? "asc" : "desc";

  let list = sortByDate(storiesCache, sortDir, "createdAt").filter((s) => {
    if (status && itemStatusKey(s) !== status) return false;
    return matchesQuery(s, q, ["title", "preview", "authorNickname"]);
  });

  if (!list.length) {
    const msg = status === "REPORTED" ? "신고된 스토리가 없습니다." : q ? "검색 결과가 없습니다." : "스토리가 없습니다.";
    body.innerHTML = `<tr><td colspan="5" class="empty">${msg}</td></tr>`;
    return;
  }
  list.forEach((s) => {
    const tr = document.createElement("tr");
    if (isReported(s)) tr.classList.add("row-reported");
    const preview = escapeHtml(s.preview ?? s.title) || "—";
    tr.innerHTML = `
      <td>${s.id ?? "—"}</td>
      <td>${escapeHtml(s.authorNickname) || "—"}</td>
      <td><span class="cell-with-badge">${reportBadgeHtml(s)}<span>${preview}</span></span></td>
      <td><span class="badge ${isReported(s) ? "bad" : ""}">${isReported(s) ? "신고됨" : "정상"}</span></td>
      <td>${s.createdAt ? String(s.createdAt).slice(0, 10) : "—"}</td>`;
    body.appendChild(tr);
  });
}

async function loadBanned() {
  const body = document.getElementById("banned-body");
  body.innerHTML = "";
  try {
    const list = (await api("/api/admin/banned-words")) || [];
    if (!list.length) {
      body.innerHTML = `<tr><td colspan="3" class="empty">금칙어가 없습니다.</td></tr>`;
      return;
    }
    list.forEach((w) => {
      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td>${w.id ?? "—"}</td>
        <td>${w.word ?? "—"}</td>
        <td><div class="row-actions"><button type="button" class="danger" data-id="${w.id}">삭제</button></div></td>`;
      body.appendChild(tr);
    });
  } catch (ex) {
    body.innerHTML = `<tr><td colspan="3" class="empty">${ex.message || "금칙어를 불러오지 못했습니다."}</td></tr>`;
  }
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

function roomsWithNotes() {
  return chatRoomsCache.map((room) => {
    const notes = getChatNotes()[room.id] || [];
    return { ...room, messages: [...(room.messages || []), ...notes] };
  });
}

function renderChatRooms() {
  const q = (document.getElementById("chat-room-q")?.value || "").toLowerCase();
  const status = document.getElementById("chat-status-filter")?.value || "";
  const sortDir = document.getElementById("chat-sort")?.value === "asc" ? "asc" : "desc";
  const list = document.getElementById("chat-room-list");
  if (!list) return;

  let rooms = sortByDate(roomsWithNotes(), sortDir, "updatedAt").filter((r) => {
    if (status && itemStatusKey(r) !== status) return false;
    if (!q) return true;
    return [r.title, r.lastMessage, ...(r.members || [])].some((v) => String(v || "").toLowerCase().includes(q));
  });

  if (!rooms.length) {
    list.innerHTML = `<p class="empty">${status === "REPORTED" ? "신고된 대화가 없습니다." : q ? "검색 결과가 없습니다." : "대화가 없습니다."}</p>`;
    return;
  }
  list.innerHTML = rooms
    .map(
      (r) => `
      <button type="button" class="chat-room ${selectedChatRoomId === String(r.id) ? "is-active" : ""} ${isReported(r) ? "is-reported" : ""}" data-room-id="${r.id}">
        <strong class="cell-with-badge">${reportBadgeHtml(r)}<span>${escapeHtml(r.title) || "대화"}</span></strong>
        <span>${escapeHtml(r.lastMessage) || ""}</span>
        <span>${escapeHtml(r.updatedAt) || ""} · ${isReported(r) ? "신고" : "정상"}</span>
      </button>`
    )
    .join("");
}

function renderChatThread(roomId) {
  const room = roomsWithNotes().find((r) => String(r.id) === String(roomId));
  const box = document.getElementById("chat-messages");
  const title = document.getElementById("chat-room-title");
  const meta = document.getElementById("chat-room-meta");
  const status = document.getElementById("chat-room-status");
  const form = document.getElementById("form-chat-note");
  if (!room) {
    title.textContent = "대화를 선택하세요";
    title.classList.remove("cell-with-badge");
    meta.textContent = "신고/모니터링용 미리보기";
    status.textContent = "—";
    status.className = "badge";
    box.innerHTML = `<p class="empty">왼쪽에서 대화를 선택하세요.</p>`;
    form.hidden = true;
    return;
  }
  if (isReported(room)) {
    title.innerHTML = `${reportBadgeHtml(room)}<span>${escapeHtml(room.title) || "대화"}</span>`;
    title.classList.add("cell-with-badge");
  } else {
    title.textContent = room.title || "대화";
    title.classList.remove("cell-with-badge");
  }
  meta.textContent = `참여자: ${(room.members || []).join(", ") || "—"}`;
  status.textContent = isReported(room) ? "신고됨" : "정상";
  status.className = `badge ${isReported(room) ? "bad is-blink" : "ok"}`;
  form.hidden = false;
  const messages = room.messages || [];
  box.innerHTML = messages.length
    ? messages
        .map(
          (m) => `
      <div class="chat-bubble ${m.side || "them"}">
        ${m.side === "admin" ? `[관리자 메모] ${m.text}` : `<b>${m.from || ""}</b><br>${m.text || ""}`}
        <small>${m.at || ""}</small>
      </div>`
        )
        .join("")
    : `<p class="empty">메시지가 없습니다.</p>`;
  box.scrollTop = box.scrollHeight;
}

async function loadChat() {
  chatRoomsCache = [];
  try {
    const data = await api("/api/admin/chats");
    chatRoomsCache = Array.isArray(data) ? data : data?.content || [];
  } catch {
    chatRoomsCache = [];
  }
  if (selectedChatRoomId && !chatRoomsCache.some((r) => String(r.id) === String(selectedChatRoomId))) {
    selectedChatRoomId = "";
  }
  renderChatRooms();
  renderChatThread(selectedChatRoomId);
}

document.querySelectorAll(".side__nav button").forEach((btn) => {
  btn.addEventListener("click", () => setPage(btn.dataset.page));
});

document.getElementById("btn-logout").addEventListener("click", () => {
  sessionStorage.removeItem(TOKEN_KEY);
  sessionStorage.removeItem(NAME_KEY);
  window.location.replace("/");
});

document.getElementById("btn-dash-reload")?.addEventListener("click", loadDashboard);
document.getElementById("revenue-group")?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-group]");
  if (!btn) return;
  revenueGroupBy = btn.dataset.group;
  loadDashboard();
});
window.addEventListener("resize", () => {
  if (!document.getElementById("page-dashboard")?.classList.contains("is-hidden")) {
    drawRevenueChart(lastRevenuePeriods);
  }
});
document.getElementById("btn-users-reload")?.addEventListener("click", loadUsers);
document.getElementById("btn-stories-reload")?.addEventListener("click", loadStories);
document.getElementById("btn-comments-reload")?.addEventListener("click", loadComments);
document.getElementById("btn-banned-reload")?.addEventListener("click", loadBanned);
document.getElementById("btn-chat-reload")?.addEventListener("click", loadChat);

document.getElementById("story-q")?.addEventListener("input", renderStories);
document.getElementById("story-status-filter")?.addEventListener("change", renderStories);
document.getElementById("story-sort")?.addEventListener("change", loadStories);
document.getElementById("comment-q")?.addEventListener("input", renderComments);
document.getElementById("comment-status-filter")?.addEventListener("change", renderComments);
document.getElementById("comment-sort")?.addEventListener("change", renderComments);
document.getElementById("chat-status-filter")?.addEventListener("change", renderChatRooms);
document.getElementById("chat-sort")?.addEventListener("change", renderChatRooms);

document.getElementById("page-users")?.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (btn && document.getElementById("users-body")?.contains(btn)) {
    e.preventDefault();
    e.stopPropagation();

    const tr = btn.closest("tr");
    let user = {};
    try {
      user = JSON.parse(tr?.dataset.user || "{}");
    } catch {
      user = {};
    }
    const key = btn.dataset.key || userApiKey(user) || btn.dataset.memberNo || "";
    if (!key) {
      const statusEl = document.getElementById("users-status");
      if (statusEl) {
        statusEl.textContent = "회원 식별값이 없어 처리할 수 없습니다. 목록을 새로고침해 주세요.";
        statusEl.style.color = "var(--danger)";
      }
      return;
    }
    user.memberUuid = user.memberUuid || user.id || null;
    user.memberNo = user.memberNo ?? btn.dataset.memberNo ?? null;

    if (btn.dataset.action === "suspend") {
      openSuspendModal({
        ...user,
        memberNo: user.memberNo ?? btn.dataset.memberNo ?? null,
        memberUuid: user.memberUuid || user.id || null,
      });
      return;
    }
    if (btn.dataset.action === "unsuspend") {
      const memberNo = user.memberNo != null ? Number(user.memberNo) : Number(btn.dataset.memberNo);
      const memberUuid = user.memberUuid || user.id || null;
      try {
        await api("/api/admin/users/unsuspend", {
          method: "POST",
          body: JSON.stringify({
            memberNo: Number.isFinite(memberNo) ? memberNo : null,
            memberUuid: memberUuid || null,
          }),
        });
        loadUsers();
      } catch (ex) {
        const statusEl = document.getElementById("users-status");
        if (statusEl) {
          statusEl.textContent = ex.message || "정지 해제에 실패했습니다.";
          statusEl.style.color = "var(--danger)";
        }
      }
    }
    return;
  }

  const row = e.target.closest("#users-body tr.is-clickable");
  if (!row) return;
  let user = {};
  try {
    user = JSON.parse(row.dataset.user || "{}");
  } catch {
    user = {};
  }
  const userId = user.memberUuid || user.id;
  if (!userId) {
    const statusEl = document.getElementById("users-status");
    if (statusEl) {
      statusEl.textContent = "회원 UUID가 없어 상세를 열 수 없습니다.";
      statusEl.style.color = "var(--danger)";
    }
    return;
  }
  openUserDetail(userId);
});

document.getElementById("btn-user-detail-close")?.addEventListener("click", closeUserDetailModal);
document.getElementById("user-detail-modal")?.addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeUserDetailModal();
});
document.getElementById("user-detail-body")?.addEventListener("click", async (e) => {
  const payBtn = e.target.closest("button[data-pay-filter]");
  if (payBtn && userDetailCache) {
    paymentTotalFilter = payBtn.dataset.payFilter || "all";
    renderUserDetail(userDetailCache);
    return;
  }
  const actionBtn = e.target.closest("button[data-detail-action]");
  if (!actionBtn || !userDetailCache?.id) return;
  const userId = userDetailCache.id;
  const action = actionBtn.dataset.detailAction;
  actionBtn.disabled = true;
  try {
    if (action === "settle") {
      const res = await api(`/api/admin/users/${encodeURIComponent(userId)}/membership/settle`, {
        method: "POST",
        body: "{}",
      });
      showUserDetailError("");
      const statusEl = document.getElementById("user-detail-status");
      if (statusEl) {
        statusEl.textContent = res?.message || "정산을 요청했습니다.";
        statusEl.style.color = "var(--ok)";
      }
      await reloadUserDetail();
    } else if (action === "nudge-email" || action === "nudge-sms") {
      const channel = action === "nudge-sms" ? "SMS" : "EMAIL";
      const res = await api(`/api/admin/users/${encodeURIComponent(userId)}/membership/nudge`, {
        method: "POST",
        body: JSON.stringify({ channel }),
      });
      showUserDetailError("");
      const statusEl = document.getElementById("user-detail-status");
      if (statusEl) {
        statusEl.textContent = res?.message || "독촉을 발송 요청했습니다.";
        statusEl.style.color = "var(--ok)";
      }
    } else if (action === "delete-comment") {
      const commentId = actionBtn.dataset.commentId;
      await api(`/api/admin/users/${encodeURIComponent(userId)}/reported-comments/${encodeURIComponent(commentId)}`, {
        method: "DELETE",
      });
      const statusEl = document.getElementById("user-detail-status");
      if (statusEl) {
        statusEl.textContent = "신고 댓글을 삭제했습니다.";
        statusEl.style.color = "var(--ok)";
      }
      await reloadUserDetail();
    }
  } catch (ex) {
    showUserDetailError(ex.message || "요청에 실패했습니다.");
  } finally {
    if (action !== "delete-comment" || document.getElementById("user-detail-body")?.contains(actionBtn)) {
      actionBtn.disabled = false;
    }
  }
});

document.getElementById("btn-suspend-cancel")?.addEventListener("click", (e) => {
  e.preventDefault();
  closeSuspendModal();
});

document.getElementById("btn-suspend-confirm")?.addEventListener("click", (e) => {
  e.preventDefault();
  e.stopPropagation();
  confirmSuspend();
});

document.getElementById("suspend-modal")?.addEventListener("click", (e) => {
  if (e.target === e.currentTarget) closeSuspendModal();
});

document.getElementById("suspend-period")?.addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-days]");
  if (!btn) return;
  e.preventDefault();
  suspendPeriod = btn.dataset.days;
  document.querySelectorAll("#suspend-period button").forEach((b) => {
    b.classList.toggle("is-active", b === btn);
  });
  const until = document.getElementById("suspend-until");
  if (until) {
    if (suspendPeriod === "custom") {
      until.classList.remove("is-hidden");
      if (!until.value) {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        until.value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
      }
    } else {
      until.classList.add("is-hidden");
    }
  }
});
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
document.getElementById("user-status-filter")?.addEventListener("change", loadUsers);
document.getElementById("user-type-filter")?.addEventListener("change", loadUsers);
document.getElementById("user-sort")?.addEventListener("change", loadUsers);
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
  try {
    await api("/api/admin/banned-words", { method: "POST", body: JSON.stringify({ word }) });
    e.target.reset();
    loadBanned();
  } catch (ex) {
    const empty = document.getElementById("banned-body");
    if (empty) {
      empty.insertAdjacentHTML(
        "afterbegin",
        `<tr><td colspan="3" class="empty">${ex.message || "추가에 실패했습니다."}</td></tr>`
      );
    }
  }
});

document.getElementById("banned-body")?.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-id]");
  if (!btn) return;
  try {
    await api(`/api/admin/banned-words/${btn.dataset.id}`, { method: "DELETE" });
    loadBanned();
  } catch (ex) {
    const empty = document.getElementById("banned-body");
    if (empty) {
      empty.insertAdjacentHTML(
        "afterbegin",
        `<tr><td colspan="3" class="empty">${ex.message || "삭제에 실패했습니다."}</td></tr>`
      );
    }
  }
});

setPage("dashboard");
