const authModal = document.getElementById("authModal");
const registrationModal = document.getElementById("registrationModal");
const authForm = document.getElementById("authForm");
const registrationForm = document.getElementById("registrationForm");
const authTitle = document.getElementById("authTitle");
const authDescription = document.getElementById("authDescription");
const authSubmit = document.getElementById("authSubmit");
const authMessage = document.getElementById("authMessage");
const switchPrompt = document.getElementById("switchPrompt");
const switchAuth = document.getElementById("switchAuth");
const currentUser = document.getElementById("currentUser");
const loginOpen = document.getElementById("loginOpen");
const signupOpen = document.getElementById("signupOpen");
const logoutBtn = document.getElementById("logoutBtn");
const adminLink = document.getElementById("adminLink");
const toast = document.getElementById("toast");
let authMode = "login";
let queuedTournament = "";

function showModal(modal) { modal.classList.remove("hidden"); }
function hideModal(modal) { modal.classList.add("hidden"); }
function setMessage(element, message, type = "") {
    element.textContent = message;
    element.className = "form-message" + (type ? " " + type : "");
}
function showToast(message) {
    toast.textContent = message;
    toast.classList.remove("hidden");
    window.setTimeout(() => toast.classList.add("hidden"), 3000);
}
function setAuthMode(mode) {
    authMode = mode;
    const isLogin = mode === "login";
    authTitle.textContent = isLogin ? "Welcome back" : "Create your account";
    authDescription.textContent = isLogin ? "Log in to join a tournament." : "Create an account to enter tournaments.";
    authSubmit.textContent = isLogin ? "Login" : "Create account";
    switchPrompt.textContent = isLogin ? "New to GameZone?" : "Already have an account?";
    switchAuth.textContent = isLogin ? "Create an account" : "Log in";
    document.getElementById("authPassword").autocomplete = isLogin ? "current-password" : "new-password";
    setMessage(authMessage, "");
}
function openAuth(mode) {
    setAuthMode(mode);
    authForm.reset();
    showModal(authModal);
}
async function apiRequest(url, options = {}) {
    const response = await fetch(url, {
        credentials: "same-origin",
        ...options,
        headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Request failed.");
    return data;
}
async function refreshUser() {
    try {
        const data = await apiRequest("/api/me");
        currentUser.textContent = "Hi, " + data.user.username;
        loginOpen.classList.add("hidden");
        signupOpen.classList.add("hidden");
        logoutBtn.classList.remove("hidden");
        adminLink.classList.toggle("hidden", data.user.role !== "admin");
    } catch {
        currentUser.textContent = "";
        loginOpen.classList.remove("hidden");
        signupOpen.classList.remove("hidden");
        logoutBtn.classList.add("hidden");
        adminLink.classList.add("hidden");
    }
}
loginOpen.addEventListener("click", () => openAuth("login"));
signupOpen.addEventListener("click", () => openAuth("signup"));
switchAuth.addEventListener("click", () => setAuthMode(authMode === "login" ? "signup" : "login"));

authForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const username = document.getElementById("authUsername").value.trim();
    const password = document.getElementById("authPassword").value;
    authSubmit.disabled = true;
    setMessage(authMessage, authMode === "login" ? "Logging in..." : "Creating account...");
    try {
        const endpoint = authMode === "login" ? "/api/login" : "/api/signup";
        const data = await apiRequest(endpoint, { method: "POST", body: JSON.stringify({ username, password }) });
        setMessage(authMessage, data.message, "success");
        await refreshUser();
        window.setTimeout(() => {
            hideModal(authModal);
            authForm.reset();
            if (queuedTournament) {
                const tournament = queuedTournament;
                queuedTournament = "";
                openRegistration(tournament);
            } else {
                showToast(data.message);
            }
        }, 450);
    } catch (error) {
        setMessage(authMessage, error.message, "error");
    } finally {
        authSubmit.disabled = false;
    }
});

logoutBtn.addEventListener("click", async () => {
    try {
        const data = await apiRequest("/api/logout", { method: "POST" });
        await refreshUser();
        showToast(data.message);
    } catch (error) { showToast(error.message); }
});

function openRegistration(tournament) {
    registrationForm.reset();
    document.getElementById("selectedTournament").value = tournament;
    document.getElementById("selectedTournamentLabel").textContent = tournament;
    setMessage(document.getElementById("registrationMessage"), "");
    showModal(registrationModal);
}
document.querySelectorAll(".register-btn").forEach((button) => {
    button.addEventListener("click", async () => {
        try {
            await apiRequest("/api/me");
            openRegistration(button.dataset.tournament);
        } catch {
            queuedTournament = button.dataset.tournament;
            openAuth("login");
            setMessage(authMessage, "Log in or create an account to register.");
        }
    });
});
registrationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const message = document.getElementById("registrationMessage");
    const payload = {
        name: document.getElementById("playerName").value.trim(),
        email: document.getElementById("playerEmail").value.trim(),
        address: document.getElementById("playerAddress").value.trim(),
        team: document.getElementById("teamName").value.trim(),
        tournament: document.getElementById("selectedTournament").value
    };
    const button = registrationForm.querySelector('button[type="submit"]');
    button.disabled = true;
    setMessage(message, "Saving registration...");
    try {
        const data = await apiRequest("/api/registrations", { method: "POST", body: JSON.stringify(payload) });
        setMessage(message, data.message, "success");
        registrationForm.reset();
        window.setTimeout(() => hideModal(registrationModal), 800);
    } catch (error) { setMessage(message, error.message, "error"); }
    finally { button.disabled = false; }
});
document.querySelectorAll("[data-close]").forEach((button) => {
    button.addEventListener("click", () => hideModal(document.getElementById(button.dataset.close)));
});
[authModal, registrationModal].forEach((modal) => modal.addEventListener("click", (event) => {
    if (event.target === modal) hideModal(modal);
}));
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") { hideModal(authModal); hideModal(registrationModal); }
});
document.getElementById("tournamentSearch").addEventListener("input", (event) => {
    const query = event.target.value.trim().toLowerCase();
    let visible = 0;
    document.querySelectorAll(".tournament-card").forEach((card) => {
        const match = card.textContent.toLowerCase().includes(query);
        card.classList.toggle("hidden", !match);
        if (match) visible++;
    });
    document.getElementById("noResults").classList.toggle("hidden", visible !== 0);
});
refreshUser();
