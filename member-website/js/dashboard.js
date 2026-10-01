const API_BASE_URL = "http://localhost:3000";
const token = sessionStorage.getItem("memberToken");
if (!token) window.location.replace("index.html");
const card = document.querySelector(".dashboard-card");
const dialog = document.getElementById("photoDialog");
const status = document.getElementById("photoMessage");
const camera = document.getElementById("photoCamera");
const input = document.getElementById("photoFile");
const byId = id => document.getElementById(id);
let stream, selected, previewUrl, profileUrl;
let saving = false, cameraRequest = 0;

async function api(view, form) {
    const response = await fetch(API_BASE_URL + "/api/member-app" + (view ? "?view=" + view : ""), {
        method: form ? "POST" : "GET",
        headers: { Authorization: "Bearer " + token },
        ...(form ? { body: form } : {})
    });
    if (response.status === 401) {
        sessionStorage.removeItem("memberToken");
        window.location.replace("index.html");
        throw new Error("Please sign in again.");
    }
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Unable to complete this request.");
    }
    return response;
}

function stopCamera() {
    cameraRequest++;
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    camera.srcObject = null;
}
function resetSelection() {
    stopCamera();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    selected = null;
    input.value = "";
    byId("photoPreview").removeAttribute("src");
    byId("photoChoices").hidden = false;
    byId("cameraPanel").hidden = true;
    byId("previewPanel").hidden = true;
    status.textContent = "";
}
async function displayPhoto() {
    const image = byId("profilePhoto");
    const blob = await (await api("photo")).blob();
    const url = URL.createObjectURL(blob);
    image.src = url;
    try { await image.decode(); }
    catch (_) { URL.revokeObjectURL(url); throw new Error("Photo preview unavailable."); }
    if (profileUrl) URL.revokeObjectURL(profileUrl);
    profileUrl = url;
    image.style.display = "block";
    byId("profileIcon").style.display = "none";
}
async function loadMember() {
    try {
        const data = await (await api("me")).json();
        const member = data.member || data;
        card.querySelector("h2").textContent = "Welcome Back, " + (member.name || "Member");
        card.querySelector(".profile-section h3").textContent = member.name || "Member";
        card.querySelector(".profile-section p").textContent = "WhatsApp: " + (member.phone || "-");
        byId("registrationNotice")?.remove();
        if (!member.approved) {
            const notice = document.createElement("div");
            notice.id = "registrationNotice";
            notice.className = "photo-warning";
            const title = document.createElement("h3");
            title.textContent = member.registrationStatus === "REJECTED" ? "Registration not approved" : "Waiting for admin approval";
            const detail = document.createElement("p");
            detail.textContent = "Registration ID: " + member.memberId + ". Your profile has been submitted. Membership and door access are not active.";
            notice.append(title, detail);
            card.querySelector(".profile-section").before(notice);
        }
        const notification = byId("membershipNotification");

if (notification && member.membership?.validEnd) {
    const endDate = new Date(member.membership.validEnd);
    const today = new Date();

    today.setHours(0, 0, 0, 0);
    endDate.setHours(0, 0, 0, 0);

    const remainingDays = Math.ceil(
        (endDate - today) / (1000 * 60 * 60 * 24)
    );

    if (remainingDays < 0) {
    notification.hidden = false;
    notification.innerHTML = `
        <strong>❌ Membership Expired</strong><br>
        Your membership has expired.
        <br>
        <button type="button" onclick="window.location.href='membership.html'">
            Renew Membership
        </button>
    `;
} else if (remainingDays <= 7) {
    notification.hidden = false;

    const expiryText = endDate.toLocaleDateString('en-MY', {
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    });

    notification.innerHTML = `
        <strong>⚠️ Membership Expiring Soon</strong><br>
        Your membership expires in
        <strong>${remainingDays} day${remainingDays === 1 ? "" : "s"}</strong>.
        <br>
        Expiry date: <strong>${expiryText}</strong>
        <br>
        <button type="button" onclick="window.location.href='membership.html'">
            Renew Membership
        </button>
    `;
} else {
    notification.hidden = true;
    notification.textContent = "";
}
}
        const membershipSection = card.querySelector(".dashboard-section");
        membershipSection.querySelector("p").textContent = member.membership
            ? member.membership.plan + " — " + member.membership.status
            : member.approved ? "No membership yet. Membership selection will be added here." : "Your selected plan and payment receipt are awaiting admin approval.";
        membershipSection.querySelector("button").disabled = !member.approved;
        card.querySelector(".photo-warning")?.remove();
        byId("profilePhotoStatus")?.remove();
        if (member.photoKey || member.memberPhotoKey) {
            try { await displayPhoto(); }
            catch (_) {
                const notice = document.createElement("p");
                notice.id = "profilePhotoStatus";
                notice.textContent = "Your photo is on file. Its preview is currently unavailable; you do not need to upload it again.";
                card.querySelector(".profile-section").after(notice);
            }
        } else {
            const warning = document.createElement("div");
            warning.className = "photo-warning";
            const heading = document.createElement("h3");
            heading.textContent = "⚠ Profile Photo Required";
            const description = document.createElement("p");
            description.textContent = member.approved
                ? "Please upload a clear photo of your face before using face verification."
                : "Your registration must be approved before you can upload a profile photo.";
            const button = document.createElement("button");
            button.type = "button";
            button.id = "uploadPhotoButton";
            button.textContent = "Upload Photo";
            button.disabled = !member.approved;
            button.addEventListener("click", () => { resetSelection(); dialog.showModal(); });
            warning.append(heading, description, button);
            card.querySelector(".profile-section").before(warning);
        }
    } catch (error) { card.querySelector("h2").textContent = error.message; }
}
async function previewPhoto(file) {
    stopCamera();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(file);
    const preview = byId("photoPreview");
    preview.src = previewUrl;
    try { await preview.decode(); }
    catch (_) { resetSelection(); status.textContent = "This image could not be opened. Please choose another photo."; return; }
    if (!dialog.open) { resetSelection(); return; }
    selected = file;
    byId("photoChoices").hidden = true;
    byId("cameraPanel").hidden = true;
    byId("previewPanel").hidden = false;
    status.textContent = "Check your photo, then select Use Photo to save it.";
}
byId("choosePhoto").addEventListener("click", () => input.click());
input.addEventListener("change", async () => {
    const file = input.files[0];
    if (!file) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || !file.size || file.size > 5 * 1024 * 1024) {
        status.textContent = "Choose a JPEG, PNG or WebP image smaller than 5 MB.";
        input.value = "";
        return;
    }
    await previewPhoto(file);
});
byId("takePhoto").addEventListener("click", async () => {
    stopCamera();
    const request = cameraRequest;
    if (!navigator.mediaDevices?.getUserMedia) {
        status.textContent = "Camera access requires HTTPS or localhost. Choose a photo from your device instead.";
        return;
    }
    status.textContent = "Allow camera access to take your photo.";
    try {
        const opened = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 1280 } }, audio: false
        });
        if (!dialog.open || request !== cameraRequest) { opened.getTracks().forEach(track => track.stop()); return; }
        stream = opened;
        camera.srcObject = stream;
        await camera.play();
        byId("cameraPanel").hidden = false;
        status.textContent = "Look directly at the camera, then select Take Photo.";
    } catch (_) {
        if (request !== cameraRequest) return;
        stopCamera();
        status.textContent = "Camera unavailable or permission denied. Allow camera access or choose a photo from your device.";
    }
});
byId("capturePhoto").addEventListener("click", () => {
    if (!camera.videoWidth) { status.textContent = "Camera is still starting. Please try again."; return; }
    const canvas = document.createElement("canvas");
    const scale = Math.min(1, 1280 / Math.max(camera.videoWidth, camera.videoHeight));
    canvas.width = Math.round(camera.videoWidth * scale);
    canvas.height = Math.round(camera.videoHeight * scale);
    canvas.getContext("2d").drawImage(camera, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(blob => {
        if (blob && dialog.open) previewPhoto(new File([blob], "profile.jpg", { type: "image/jpeg" }));
    }, "image/jpeg", 0.9);
});
byId("retakePhoto").addEventListener("click", resetSelection);
byId("closePhoto").addEventListener("click", () => { if (!saving) dialog.close(); });
dialog.addEventListener("cancel", event => { if (saving) event.preventDefault(); });
dialog.addEventListener("close", resetSelection);
byId("savePhoto").addEventListener("click", async () => {
    if (!selected || saving) return;
    saving = true;
    dialog.querySelectorAll("button").forEach(button => { button.disabled = true; });
    status.textContent = "Saving your photo...";
    const form = new FormData();
    form.set("action", "upload-photo");
    form.set("photo", selected);
    try {
        await api(null, form);
        dialog.close();
        await loadMember();
    } catch (error) { status.textContent = error.message; }
    finally {
        saving = false;
        dialog.querySelectorAll("button").forEach(button => { button.disabled = false; });
    }
});
byId("logoutButton").addEventListener("click", () => {
    stopCamera();
    sessionStorage.removeItem("memberToken");
    sessionStorage.removeItem("otpPhone");
    window.location.href = "index.html";
});
window.addEventListener("pagehide", () => {
    stopCamera();
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    if (profileUrl) URL.revokeObjectURL(profileUrl);
});
if (token) loadMember();
