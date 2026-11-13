const API_BASE_URL =
    ["localhost", "127.0.0.1", "[::1]", "::1"].includes(window.location.hostname)
        ? "http://localhost:3000"
        : "https://membership-api.smartgogo.net";
const gymSearch = document.getElementById("gymSearch");
const gymSuggestions = document.getElementById("gymSuggestions");
const confirmGymButton = document.getElementById("confirmGymButton");
const loginForm = document.getElementById("loginForm");
const phoneInput = document.getElementById("phone");
const loginButton = loginForm.querySelector('button[type="submit"]');
const message = document.getElementById("message");
let selectedWorkspace = "";
let workspaces = [];
let selectedWorkspaceRecord = null;

function renderWorkspaces() {
    const query = gymSearch.value.trim().toLowerCase();
    selectedWorkspace = "";
    selectedWorkspaceRecord = null;
    confirmGymButton.disabled = true;
    const matches = workspaces.filter(workspace =>
        String(workspace.name || "").toLowerCase().includes(query)
    );
    gymSuggestions.replaceChildren();
    if (!matches.length) {
        const empty = document.createElement("div");
        empty.className = "gym-suggestion-empty";
        empty.textContent = "No gym found";
        gymSuggestions.append(empty);
    } else {
        matches.forEach(workspace => {
            const option = document.createElement("button");
            option.type = "button";
            option.className = "gym-suggestion";
            option.setAttribute("role", "option");
            option.textContent = workspace.name;
            option.addEventListener("click", () => selectWorkspace(workspace));
            gymSuggestions.append(option);
        });
    }
    gymSuggestions.hidden = false;
}

function selectWorkspace(workspace) {
    selectedWorkspaceRecord = workspace;
    selectedWorkspace = String(workspace.code || workspace.id || "");
    gymSearch.value = workspace.name;
    gymSuggestions.hidden = true;
    confirmGymButton.disabled = !selectedWorkspace;
    message.textContent = "";
}

async function loadWorkspaces() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/member-app?view=workspaces`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load gyms.");
        workspaces = data.workspaces || [];
        renderWorkspaces();
    } catch (error) {
        gymSuggestions.replaceChildren();
        const failed = document.createElement("div");
        failed.className = "gym-suggestion-empty";
        failed.textContent = "Unable to load gyms";
        gymSuggestions.append(failed);
        gymSuggestions.hidden = false;
        throw new Error(error.message || "Unable to load gyms.");
    }
}

loadWorkspaces().catch((error) => {
    message.textContent = error.message;
});

gymSearch.addEventListener("input", renderWorkspaces);
document.addEventListener("click", event => {
    if (!event.target.closest(".gym-autocomplete")) gymSuggestions.hidden = true;
});

confirmGymButton.addEventListener("click", () => {
    if (!selectedWorkspace || !selectedWorkspaceRecord) {
        message.textContent = "Please select your gym first.";
        return;
    }
    confirmGymButton.disabled = true;
    sessionStorage.setItem("workspace", selectedWorkspace);
    sessionStorage.setItem("workspaceId", selectedWorkspace);
    loginForm.style.display = "block";
    message.textContent = "Enter your registered WhatsApp number to sign in.";
    phoneInput.focus();
    confirmGymButton.disabled = false;
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
