function requireGuest() {
  if (getToken()) {
    window.location.href = "dashboard.html";
  }
}

async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const errorEl = document.getElementById("error");
  errorEl.textContent = "";

  try {
    const data = await apiRequest("/api/auth/login", {
      method: "POST",
      body: { email, password },
    });
    setSession(data.token, data.user);
    window.location.href = "dashboard.html";
  } catch (err) {
    errorEl.textContent = err.message;
  }
}

async function handleRegister(event) {
  event.preventDefault();
  const name = document.getElementById("name").value.trim();
  const email = document.getElementById("email").value.trim();
  const password = document.getElementById("password").value;
  const errorEl = document.getElementById("error");
  errorEl.textContent = "";

  try {
    const data = await apiRequest("/api/auth/register", {
      method: "POST",
      body: { name, email, password },
    });
    setSession(data.token, data.user);
    window.location.href = "dashboard.html";
  } catch (err) {
    errorEl.textContent = err.message;
  }
}
