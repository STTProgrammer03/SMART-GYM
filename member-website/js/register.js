const API_BASE_URL = "http://localhost:3000";
let registrationFeeCents = 0;
const registerForm = document.getElementById("registerForm");
const photoInput = document.getElementById("photo");
const preview = document.getElementById("registrationPhotoPreview");
const message = document.getElementById("message");
const registerButton = document.getElementById("registerButton");
let previewUrl;
let submitting = false;
const phoneInput = document.getElementById('phone');
const planInput = document.getElementById('planId');
const sendOtpButton = document.getElementById('sendOtpButton');
const verifyOtpButton = document.getElementById('verifyOtpButton');
const otpMessage = document.getElementById('otpMessage');
const retryPlansButton = document.getElementById('retryPlansButton');
let registrationToken = '';
let verifiedUntil = 0;
let resendAt = 0;
let otpBusy = false;
let otpOperation = '';
function updateControls() {
    if (registrationToken && Date.now() >= verifiedUntil) {
        registrationToken = '';
        otpMessage.textContent = 'Verification expired. Please request a new OTP.';
    }
    const remaining = Math.max(0, Math.ceil((resendAt - Date.now()) / 1000));
    sendOtpButton.disabled = submitting || otpBusy || remaining > 0 || Boolean(registrationToken);
    sendOtpButton.textContent = otpOperation === 'send' ? 'Sending WhatsApp OTP...'
        : registrationToken ? 'WhatsApp Number Verified'
        : remaining ? `Resend OTP (${remaining}s)` : 'Get WhatsApp OTP';
    verifyOtpButton.disabled = submitting || otpBusy || Boolean(registrationToken);
    verifyOtpButton.textContent = otpOperation === 'verify' ? 'Verifying...'
        : registrationToken ? 'Verified' : 'Verify Number';
    registerButton.disabled = submitting || !registrationToken || !planInput.value;
}
async function post(fields) {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.set(key, value);
    let response;
    try {
        response = await fetch(API_BASE_URL + '/api/member-app', {
            method: 'POST', body: form, signal: AbortSignal.timeout(30000)
        });
    } catch (error) {
        if (error.name === 'TimeoutError' || error.name === 'AbortError') {
            throw new Error('The OTP request timed out. Please wait a minute and try again.');
        }
        throw new Error('Cannot reach the backend. Open this website at http://localhost:8080 and make sure the backend on port 3000 is running.');
    }
    const data = await response.json();
    if (!response.ok) {
        if (response.status === 429) resendAt = Date.now() + 60000;
        throw new Error(data.error || 'Unable to complete the request.');
    }
    return data;
}
phoneInput.addEventListener('input', () => {
    registrationToken = '';
    document.getElementById('otp').value = '';
    otpMessage.textContent = 'Verify this WhatsApp number before registering.';
    updateControls();
});
planInput.addEventListener('change', () => {
    updateControls();

    const selectedPlan = planInput.value;
    const totalElement = document.getElementById('registrationTotal');

    if (!selectedPlan) {
        totalElement.textContent = '';
        return;
    }

    const selectedOption = planInput.options[planInput.selectedIndex];
    const planPriceText = selectedOption.textContent.match(/RM\s?([\d,.]+)/);

    if (!planPriceText) {
        totalElement.textContent = '';
        return;
    }

    const planPrice = parseFloat(
        planPriceText[1].replace(/,/g, '')
    );

    const total = planPrice + (registrationFeeCents / 100);

    totalElement.innerHTML = `
        <strong>Registration Fee:</strong> RM60.00<br>
        <strong>Total Amount:</strong> RM${total.toFixed(2)}
    `;
});
sendOtpButton.addEventListener('click', async () => {
    if (otpBusy || submitting) return;
    if (!phoneInput.value.trim()) {
        otpMessage.textContent = 'Enter your WhatsApp number first.';
        phoneInput.focus();
        return;
    }
    if (!phoneInput.reportValidity()) return;
    otpBusy = true;
    otpOperation = 'send';
    registrationToken = '';
    const requestedPhone = phoneInput.value;
    updateControls();
    otpMessage.textContent = 'Requesting a WhatsApp code...';
    try {
        await post({ action: 'request-otp', phone: requestedPhone.trim() });
        resendAt = Date.now() + 60000;
        otpMessage.textContent = phoneInput.value === requestedPhone
            ? 'Check WhatsApp for your 6-digit code. It expires in 5 minutes.'
            : 'Your number changed. Request a new code for this number.';
    } catch (error) { otpMessage.textContent = error.message; }
    finally { otpBusy = false; otpOperation = ''; updateControls(); }
});
verifyOtpButton.addEventListener('click', async () => {
    if (otpBusy || submitting) return;
    const otp = document.getElementById('otp').value.trim();
    if (!/^\d{6}$/.test(otp)) { otpMessage.textContent = 'Enter the 6-digit OTP from WhatsApp.'; return; }
    const requestedPhone = phoneInput.value;
    otpBusy = true;
    otpOperation = 'verify';
    updateControls();
    try {
        const data = await post({ action: 'verify-otp', phone: requestedPhone.trim(), otp });
        if (phoneInput.value !== requestedPhone) throw new Error('Your number changed. Verify the new number.');
        if (!data.registrationToken) throw new Error('Verification failed. Please request another code.');
        registrationToken = data.registrationToken;
        verifiedUntil = Date.now() + 15 * 60000;
        otpMessage.textContent = 'Number verified. Complete your registration within 15 minutes.';
    } catch (error) { otpMessage.textContent = error.message; }
    finally { otpBusy = false; otpOperation = ''; updateControls(); }
});
async function loadPlans() {
    retryPlansButton.hidden = true;

    try {
        const response = await fetch(
            API_BASE_URL + '/api/member-app?view=registration-options'
        );

        const data = await response.json();

        console.log("REGISTRATION PLANS:", data.plans);
        registrationFeeCents = data.registrationFeeCents || 0;

        if (!response.ok) {
            throw new Error(data.error || 'Unable to load plans.');
        }

        planInput.replaceChildren(
            new Option('Choose a membership plan', '')
        );

        for (const plan of data.plans) {
            const price = new Intl.NumberFormat('en-MY', {
                style: 'currency',
                currency: 'MYR'
            }).format(plan.priceCents / 100);

            planInput.add(
                new Option(
                    `${plan.name} — ${price}`,
                    plan.id
                )
            );
        }

        planInput.disabled = !data.plans.length;

        document.getElementById('paymentInstructions').textContent =
            data.paymentInstructions ||
            'Contact the gym for payment details before uploading your receipt.';

        if (!data.plans.length) {
            throw new Error(
                'No membership plans are available. Please contact the gym.'
            );
        }

    } catch (error) {
        message.textContent = error.message;
        retryPlansButton.hidden = false;
    }

    updateControls();
}
retryPlansButton.addEventListener('click', loadPlans);
loadPlans();
setInterval(updateControls, 1000);
function validPhoto(file) {
    return file && ["image/jpeg", "image/png", "image/webp"].includes(file.type)
        && file.size > 0 && file.size <= 5 * 1024 * 1024;
}
photoInput.addEventListener("change", () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    preview.hidden = true;
    const file = photoInput.files[0];
    if (!file) return;
    if (!validPhoto(file)) {
        message.textContent = "Choose a JPEG, PNG or WebP photo smaller than 5 MB.";
        photoInput.value = "";
        return;
    }
    message.textContent = "";
    previewUrl = URL.createObjectURL(file);
    preview.src = previewUrl;
    preview.hidden = false;
});
registerForm.addEventListener("submit", async event => {
    event.preventDefault();
    if (submitting) return;
    const fullName = document.getElementById("fullName").value.trim();
    const phone = document.getElementById("phone").value.trim();
    const photo = photoInput.files[0];
    const receipt = document.getElementById('receipt').files[0];
    updateControls();
    if (!registrationToken) { message.textContent = 'Verify your WhatsApp number first.'; return; }
    if (!planInput.value || !validPhoto(receipt)) {
        message.textContent = 'Choose a membership plan and a valid payment receipt image.';
        return;
    }
    if (!fullName || !phone || !validPhoto(photo)) {
        message.textContent = "Enter your name, WhatsApp number and a valid profile photo.";
        return;
    }
    submitting = true;
    registerButton.disabled = true;
    message.textContent = "Submitting registration for admin approval...";
    const form = new FormData();
    form.set("action", "register");
    form.set("fullName", fullName);
    form.set("phone", phone);
    form.set("photo", photo);
    form.set('receipt', receipt);
    form.set('planId', planInput.value);
    form.set('registrationToken', registrationToken);
    try {
        const response = await fetch(API_BASE_URL + "/api/member-app", { method: "POST", body: form });
        const data = await response.json();
        if (!response.ok) {
            if (response.status === 401) registrationToken = '';
            throw new Error(data.error || "Registration failed.");
        }
        if (!data.token) throw new Error("Registration response is incomplete. Please contact the gym before trying again.");
        sessionStorage.setItem("memberToken", data.token);
        window.location.href = "dashboard.html";
    } catch (error) { message.textContent = error.message; }
    finally { submitting = false; updateControls(); }
});
window.addEventListener("pagehide", () => { if (previewUrl) URL.revokeObjectURL(previewUrl); });
