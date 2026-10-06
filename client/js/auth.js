function requireGuest() {
  if (getToken()) {
    window.location.replace("dashboard.html");
  }
}

// Messages shown when another page sends the user here (login.html?reason=...)
const AUTH_NOTICES = {
  loggedout: { type: "success", text: "You have been logged out." },
  expired: { type: "error", text: "Your session expired. Please log in again." },
};

function initAuthPage() {
  document.querySelector(".auth-page").append(themeToggleButton());

  // Show / hide password
  document.querySelectorAll("[data-toggle-password]").forEach((button) => {
    const input = document.getElementById(button.dataset.togglePassword);
    button.addEventListener("click", () => {
      const show = input.type === "password";
      input.type = show ? "text" : "password";
      button.textContent = show ? "Hide" : "Show";
    });
  });

  const reason = new URLSearchParams(window.location.search).get("reason");
  const notice = AUTH_NOTICES[reason];
  const noticeEl = document.getElementById("notice");
  if (notice && noticeEl) {
    noticeEl.className = `notice ${notice.type}`;
    noticeEl.textContent = notice.text;
    noticeEl.hidden = false;
    history.replaceState(null, "", window.location.pathname);
  }
}

// Client-side checks give a faster, clearer message - the API validates again
const isEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim());

function firstProblem(fields) {
  for (const { input, valid, message } of fields) {
    if (!valid(input.value)) {
      input.setAttribute("aria-invalid", "true");
      input.focus();
      return message;
    }
    input.removeAttribute("aria-invalid");
  }
  return null;
}

async function submitAuth(event, path, body, fields, loadingText) {
  event.preventDefault();
  const errorEl = document.getElementById("error");
  const button = document.getElementById("submit-btn");
  errorEl.textContent = "";

  const problem = firstProblem(fields);
  if (problem) {
    errorEl.textContent = problem;
    return;
  }

  setLoading(button, true, loadingText);
  try {
    const data = await apiRequest(path, { method: "POST", body: body() });
    setSession(data.token, data.user);
    window.location.href = "dashboard.html";
  } catch (err) {
    // fetch() rejects with a TypeError when the server can't be reached at all
    errorEl.textContent =
      err instanceof TypeError
        ? "Can't reach the server. It may be waking up - wait a minute and try again."
        : err.message;
    setLoading(button, false);
  }
}

function handleLogin(event) {
  const email = document.getElementById("email");
  const password = document.getElementById("password");
  return submitAuth(
    event,
    "/api/auth/login",
    () => ({ email: email.value.trim(), password: password.value }),
    [
      { input: email, valid: isEmail, message: "Enter a valid email address." },
      { input: password, valid: (v) => v.length > 0, message: "Enter your password." },
    ],
    "Logging in...",
  );
}

function handleRegister(event) {
  const name = document.getElementById("name");
  const email = document.getElementById("email");
  const password = document.getElementById("password");
  return submitAuth(
    event,
    "/api/auth/register",
    () => ({ name: name.value.trim(), email: email.value.trim(), password: password.value }),
    [
      { input: name, valid: (v) => v.trim().length > 0, message: "Enter your name." },
      { input: email, valid: isEmail, message: "Enter a valid email address." },
      { input: password, valid: (v) => v.length >= 6, message: "Password must be at least 6 characters." },
    ],
    "Creating account...",
  );
}
