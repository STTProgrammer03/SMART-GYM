const API_BASE_URL = "http://localhost:3000";

let selectedWorkspace = "";

const workspaceSelect = document.getElementById("workspace");
const confirmGymBtn = document.getElementById("confirmGymBtn");
const loginForm = document.getElementById("loginForm");

async function loadWorkspaces() {
    try {
        const response = await fetch(
            `${API_BASE_URL}/api/member-app?view=workspaces`
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || "Unable to load gyms.");
        }

        workspaceSelect.innerHTML =
            '<option value="">Select your gym</option>';

        data.workspaces.forEach((workspace) => {
            const option = document.createElement("option");

            option.value = workspace.code;
            option.textContent = workspace.name;

            workspaceSelect.appendChild(option);
        });
    } catch (error) {
        workspaceSelect.innerHTML =
            '<option value="">Unable to load gyms</option>';

        console.error(error);
    }
}

loadWorkspaces();

confirmGymBtn.addEventListener("click", () => {
    const workspace = workspaceSelect.value;

    if (!workspace) {
        message.textContent = "Please select your gym.";
        return;
    }

    selectedWorkspace = workspace;
    sessionStorage.setItem("workspace", workspace);

    workspaceSelect.disabled = true;
    confirmGymBtn.disabled = true;

    loginForm.style.display = "block";

    message.textContent =
        `Gym selected: ${workspaceSelect.options[workspaceSelect.selectedIndex].text}`;
});

const message = document.getElementById("message");
const phoneInput = document.getElementById("phone");

async function detectWorkspace(phone) {
    const response = await fetch(`${API_BASE_URL}/api/member-app?view=workspace-for-phone&phone=${encodeURIComponent(phone)}`);
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Unable to find your gym.");
    if (data.workspaces.length === 1) {
        const found = data.workspaces[0];
        selectedWorkspace = found.workspaceId;
        sessionStorage.setItem("workspace", selectedWorkspace);
        workspaceSelect.innerHTML = `<option value="${found.workspaceId}">${found.name}</option>`;
        workspaceSelect.value = found.workspaceId;
        workspaceSelect.disabled = true;
        confirmGymBtn.disabled = true;
        loginForm.style.display = "block";
        message.textContent = `Gym found: ${found.name}`;
    } else if (data.workspaces.length > 1) {
        message.textContent = "This number is registered at more than one gym. Please select your gym.";
    }
}

phoneInput.addEventListener("blur", () => {
    if (phoneInput.value.trim()) detectWorkspace(phoneInput.value.trim()).catch(error => message.textContent = error.message);
});

loginForm.addEventListener("submit", async (event) => {

    event.preventDefault();


    const phone =
        document.getElementById("phone").value.trim();


    if (!phone) {

        message.textContent =
            "Please enter your WhatsApp number.";

        return;
    }


    message.textContent =
        "Requesting WhatsApp OTP...";


    const formData =
        new FormData();

    formData.append(
        "action",
        "request-otp"
    );

    formData.append(
    "purpose",
    "login"
);

    formData.append(
        "phone",
        phone
    );


    try {

        const response = await fetch(
            `${API_BASE_URL}/api/member-app`,
            {
                method: "POST",
                headers: { "X-Workspace": selectedWorkspace },
                body: formData
            }
        );


        const data =
            await response.json();


        if (!response.ok) {

            throw new Error(
                data.error ||
                "Unable to request OTP."
            );

        }


        // Remember the phone number
        // for the OTP page.

        sessionStorage.setItem(
            "otpPhone",
            phone
        );


        // Go to OTP page.

        window.location.href =
            "otp.html";


    } catch (error) {

        console.error(error);

        message.textContent =
            error.message;

    }

});
