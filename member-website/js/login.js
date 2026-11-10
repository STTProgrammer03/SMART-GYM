const API_BASE_URL = window.MEMBER_API_BASE_URL || "";
const workspaceSelect = document.getElementById("workspace");
const loginForm = document.getElementById("loginForm");
const phoneInput = document.getElementById("phone");
const loginButton = loginForm.querySelector('button[type="submit"]');
const message = document.getElementById("message");
let selectedWorkspace = "";

async function loadWorkspaces() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/member-app?view=workspaces`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load gyms.");
        workspaceSelect.innerHTML = '<option value="">Select your gym</option>';
        data.workspaces.forEach((workspace) => {
            const option = document.createElement("option");
            option.value = workspace.code;
            option.textContent = workspace.name;
            workspaceSelect.appendChild(option);
        });
    } catch (error) {
        workspaceSelect.innerHTML = '<option value="">Unable to load gyms</option>';
        message.textContent = error.message || "Unable to load gyms.";
    }
}

loadWorkspaces();

workspaceSelect.addEventListener("change", () => {
    selectedWorkspace = workspaceSelect.value;
    loginForm.style.display = selectedWorkspace ? "block" : "none";
    if (selectedWorkspace) {
        sessionStorage.setItem("workspace", selectedWorkspace);
        message.textContent = "Enter your registered WhatsApp number to sign in.";
        phoneInput.focus();
    } else {
        sessionStorage.removeItem("workspace");
        message.textContent = "";
    }
});

loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const phone = phoneInput.value.trim();
    if (!phone || !selectedWorkspace) {
        message.textContent = "Select your gym and enter your registered WhatsApp number.";
        return;
    }
    loginButton.disabled = true;
    message.textContent = "Signing in...";
    const form = new FormData();
    form.set("action", "login");
    form.set("phone", phone);
    try {
        const response = await fetch(`${API_BASE_URL}/api/member-app`, {
            method: "POST",
            headers: { "X-Workspace": selectedWorkspace },
            body: form
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to sign in.");
        sessionStorage.setItem("memberToken", data.token);
        sessionStorage.setItem("workspace", selectedWorkspace);
        window.location.replace("dashboard.html");
    } catch (error) {
        message.textContent = error.message || "Unable to sign in.";
    } finally {
        loginButton.disabled = false;
    }
});
