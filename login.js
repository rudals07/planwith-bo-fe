const TOKEN_KEY = "planwith_bo_token";
const DEMO_KEY = "planwith_bo_demo";
const NAME_KEY = "planwith_bo_name";

const errEl = document.getElementById("login-error");
const form = document.getElementById("form-login");
const btn = document.getElementById("btn-login");

function setError(msg) {
  errEl.textContent = msg || "";
  errEl.style.display = msg ? "block" : "none";
}

function goApp() {
  window.location.replace("/app.html");
}

// 이미 로그인돼 있으면 바로 이동
if (sessionStorage.getItem(TOKEN_KEY)) {
  goApp();
}

async function loginApi(adminId, password) {
  const res = await fetch("/api/admin/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ adminId, password }),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || json?.success === false) {
    throw new Error(json?.message || json?.error?.message || `로그인 실패 (${res.status})`);
  }
  const access = json?.data?.accessToken;
  if (!access) throw new Error("accessToken 없음");
  return access;
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  setError("");

  const adminId = document.getElementById("adminId").value.trim();
  const password = document.getElementById("password").value;

  if (!adminId || !password) {
    setError("ID와 비밀번호를 입력하세요.");
    return;
  }

  btn.disabled = true;
  btn.textContent = "로그인 중…";

  try {
    const token = await loginApi(adminId, password);
    sessionStorage.setItem(TOKEN_KEY, token);
    sessionStorage.removeItem(DEMO_KEY);
    sessionStorage.setItem(NAME_KEY, adminId);
    goApp();
  } catch (ex) {
    // 연결 실패면 데모 진입 제안, 그 외는 에러 표시
    const network = String(ex.message || "").includes("Failed to fetch") || ex.name === "TypeError";
    if (network) {
      setError("BO API(8081) 연결 실패. 아래 데모 버튼을 사용하세요.");
    } else {
      setError(ex.message || "로그인 실패");
    }
    btn.disabled = false;
    btn.textContent = "로그인";
  }
});

document.getElementById("btn-demo").addEventListener("click", () => {
  sessionStorage.setItem(TOKEN_KEY, "demo-token");
  sessionStorage.setItem(DEMO_KEY, "1");
  sessionStorage.setItem(NAME_KEY, "demo-admin");
  goApp();
});
