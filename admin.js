async function requestJson(url, options = {}) {
    const response = await fetch(url, {
        credentials: "same-origin",
        ...options,
        headers: { ...(options.body ? { "Content-Type": "application/json" } : {}), ...(options.headers || {}) }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Request failed.");
    return data;
}
function addCell(row, value) {
    const cell = document.createElement("td");
    cell.textContent = value || "—";
    row.appendChild(cell);
}
async function loadRegistrations() {
    const status = document.getElementById("adminStatus");
    const error = document.getElementById("adminError");
    const tbody = document.getElementById("registrationRows");
    status.textContent = "Loading registrations...";
    error.textContent = "";
    try {
        const data = await requestJson("/api/admin/registrations");
        status.textContent = `${data.registrations.length} registration(s) found`;
        tbody.replaceChildren();
        if (!data.registrations.length) {
            const row = document.createElement("tr");
            const cell = document.createElement("td");
            cell.colSpan = 7; cell.className = "empty-state"; cell.textContent = "No registrations yet.";
            row.appendChild(cell); tbody.appendChild(row); return;
        }
        data.registrations.forEach((item) => {
            const row = document.createElement("tr");
            addCell(row, item.name); addCell(row, item.username); addCell(row, item.email);
            addCell(row, item.address); addCell(row, item.team); addCell(row, item.tournament);
            addCell(row, item.registeredAt ? new Date(item.registeredAt).toLocaleString() : "");
            tbody.appendChild(row);
        });
    } catch (err) {
        status.textContent = "Could not load registrations";
        error.textContent = err.message;
        if (err.message.toLowerCase().includes("admin")) error.textContent += " Sign in with the configured admin account.";
        tbody.replaceChildren();
    }
}
document.getElementById("refreshRegistrations").addEventListener("click", loadRegistrations);
document.getElementById("adminLogout").addEventListener("click", async () => {
    try { await requestJson("/api/logout", { method: "POST" }); }
    finally { window.location.href = "/"; }
});
loadRegistrations();
