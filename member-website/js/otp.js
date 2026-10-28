const API_BASE_URL = "http://localhost:3000";

const otpForm = document.getElementById("otpForm");
const otpInput = document.getElementById("otp");
const message = document.getElementById("message");
const resendButton = document.getElementById("resendButton");

const phone = sessionStorage.getItem("otpPhone");
const workspace = sessionStorage.getItem("workspace");
const workspaceHeaders = workspace ? { "X-Workspace": workspace } : {};

if (!phone) {
    window.location.replace("index.html");
}

async function requestOtp() {
    const formData = new FormData();
    formData.set("action", "request-otp");
    formData.set("purpose", "login");
    formData.set("phone", phone);

    const response = await fetch(`${API_BASE_URL}/api/member-app`, {
        method: "POST",
        headers: workspaceHeaders,
        body: formData
    });

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.error || "Unable to request OTP.");
    }

    return data;
}

otpForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const otp = otpInput.value.trim();

    if (!otp) {
        message.textContent = "Please enter your OTP.";
        return;
    }

    if (!/^\d{6}$/.test(otp)) {
        message.textContent = "Please enter the 6-digit OTP.";
        return;
    }

    message.textContent = "Verifying OTP...";

    try {
        // Step 1: Verify the WhatsApp OTP
        const verifyForm = new FormData();
        verifyForm.set("action", "verify-otp");
        verifyForm.set("phone", phone);
        verifyForm.set("otp", otp);

        const verifyResponse = await fetch(
            `${API_BASE_URL}/api/member-app`,
            {
                method: "POST",
                headers: workspaceHeaders,
                body: verifyForm
            }
        );

        const verifyData = await verifyResponse.json();

        if (!verifyResponse.ok) {
            throw new Error(
                verifyData.error || "Unable to verify OTP."
            );
        }

        // Step 2: Use the verified phone number to create login session
        const loginForm = new FormData();
        loginForm.set("action", "login");
        loginForm.set("phone", phone);

        const loginResponse = await fetch(
            `${API_BASE_URL}/api/member-app`,
            {
                method: "POST",
                headers: workspaceHeaders,
                body: loginForm
            }
        );

        const loginData = await loginResponse.json();

        if (!loginResponse.ok) {
            throw new Error(
                loginData.error || "Unable to sign in."
            );
        }

        // Step 3: Save login token for dashboard
        sessionStorage.setItem("memberToken", loginData.token);

        // Keep phone for reference
        sessionStorage.setItem("otpPhone", phone);

        // Step 4: Go to dashboard
        window.location.replace("dashboard.html");

    } catch (error) {
        console.error(error);
        message.textContent = error.message;
    }
});


resendButton.addEventListener("click", async () => {
    resendButton.disabled = true;
    message.textContent = "Requesting a new OTP...";

    try {
        await requestOtp();

        message.textContent = "A new OTP has been sent to your WhatsApp.";
        otpInput.value = "";

    } catch (error) {
        console.error(error);
        message.textContent = error.message;

    } finally {
        resendButton.disabled = false;
    }
});
