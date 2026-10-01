const API_BASE_URL = "http://localhost:3000";

const token = sessionStorage.getItem("memberToken");

if (!token) {
    window.location.href = "index.html";
}


// ==========================================
// LOAD CURRENT MEMBERSHIP
// ==========================================

async function loadMembership() {

    const currentMembership =
        document.getElementById("currentMembership");

    try {

        currentMembership.innerHTML =
            "<p>Loading membership...</p>";

        const response = await fetch(
            `${API_BASE_URL}/api/member-app?view=me`,
            {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Failed to load membership."
            );
        }

        const membership = data.membership;

        if (!membership) {

            currentMembership.innerHTML = `
                <div>
                    <h3>No Active Membership</h3>

                    <p>
                        You don't have an active membership yet.
                    </p>

                    <p>
                        Choose a membership plan below to get started.
                    </p>
                </div>
            `;

            return;
        }


        // Calculate remaining days

let remainingText = "—";

const today = new Date();

today.setHours(0, 0, 0, 0);

if (membership.validEnd) {

    const endDate =
        new Date(membership.validEnd);

    endDate.setHours(0, 0, 0, 0);

    const difference =
        endDate - today;

    const days =
        Math.ceil(
            difference / (1000 * 60 * 60 * 24)
        );

    if (days > 0) {

        remainingText =
            `${days} day${days === 1 ? "" : "s"} remaining`;

    } else if (days === 0) {

        remainingText =
            "Expires today";

    } else {

        remainingText =
            "Expired";
    }
}

        // ==========================================
// MEMBERSHIP STATUS
// ==========================================

const status = (membership.status || "").toUpperCase();

const isActive = status === "ACTIVE";

const statusClass = isActive
    ? "membership-status-active"
    : "membership-status-inactive";

const statusText = isActive
    ? "ACTIVE"
    : status || "INACTIVE";


// ==========================================
// FORMAT DATES
// ==========================================

function formatMembershipDate(dateValue) {

    if (!dateValue) {
        return "—";
    }

    const date = new Date(dateValue);

    if (Number.isNaN(date.getTime())) {
        return "—";
    }

    return date.toLocaleDateString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric"
    });
}

const startDate = new Date(membership.validStart);
const endDate = new Date(membership.validEnd);

const totalTime =
    endDate.getTime() - startDate.getTime();

const elapsedTime =
    today.getTime() - startDate.getTime();

let progress = 0;

if (totalTime > 0) {

    progress =
        ((elapsedTime / totalTime) * 100);

    progress =
        Math.max(0, Math.min(100, progress));
}


// ==========================================
// DISPLAY MEMBERSHIP
// ==========================================

currentMembership.innerHTML = `

    <div class="membership-card">

        <div class="membership-card-header">

            <div>

                <h3>
                    ${membership.plan || "Membership"}
                </h3>

                <span class="${statusClass}">
                    ● ${statusText}
                </span>

            </div>

        </div>


        <div class="membership-info">

            <div class="membership-info-item">

                <span>Start Date</span>

                <strong>
                    ${formatMembershipDate(membership.validStart)}
                </strong>

            </div>


            <div class="membership-info-item">

                <span>End Date</span>

                <strong>
                    ${formatMembershipDate(membership.validEnd)}
                </strong>

            </div>


            <div class="membership-info-item">

                <span>Remaining</span>

                <strong>
                    ${remainingText}
                </strong>

            </div>

        </div>

        <div style="margin-top: 16px;">
    <button
        type="button"
        onclick="startRenewal()"
    >
        Renew Membership
    </button>
</div>


        <div class="membership-progress-section">

            <div class="membership-progress-label">

                <span>Membership Progress</span>

                <strong>${Math.round(progress)}%</strong>

            </div>

            <div class="membership-progress-bar">

                <div
                    class="membership-progress-fill ${isActive ? "progress-active" : "progress-expired"}"
                    style="width: ${progress}%"
                ></div>

            </div>

        </div>

    </div>

`;

    } catch (error) {

        console.error(error);

        currentMembership.innerHTML = `
            <p>
                Unable to load membership information.
            </p>
        `;
    }
}


// ==========================================
// LOAD MEMBERSHIP PLANS
// ==========================================

async function loadPlans() {

    const membershipPlans =
        document.getElementById("membershipPlans");

    try {

        membershipPlans.innerHTML =
            "<p>Loading plans...</p>";

        const response = await fetch(
            `${API_BASE_URL}/api/member-app?view=plans`,
            {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${token}`
                }
            }
        );

        const data = await response.json();

if (!response.ok) {
    throw new Error(
        data.error || "Failed to load plans."
    );
}

const plans = data.plans || [];

sessionStorage.setItem(
    "membershipPlans",
    JSON.stringify(plans)
);

const renewalMode =
    sessionStorage.getItem("renewalMode") === "true";

const renewalSection =
    document.getElementById("renewalSection");

const renewalPlans =
    document.getElementById("renewalPlans");

if (renewalMode && renewalSection) {
    renewalSection.style.display = "block";
}


        // No plans

        if (!plans.length) {

            membershipPlans.innerHTML = `
                <p>
                    No membership plans are currently available.
                </p>
            `;

            return;
        }


        // Display plans

const targetContainer = membershipPlans;

targetContainer.innerHTML = plans.map(plan => {

            const price =
                (Number(plan.priceCents || 0) / 100)
                .toFixed(2);

            let duration = "";

            if (plan.durationDays) {

                duration =
                    `${plan.durationDays} days`;

            } else {

                duration =
                    `${plan.durationValue} ${plan.durationUnit}`;
            }


            return `
                <div class="membership-plan-card">

                    <h3>
                        ${plan.name}
                    </h3>

                    <p>
                        ${duration}
                    </p>

                    <p class="membership-price">
                        RM ${price}
                    </p>

                    <button
                        onclick="choosePlan('${plan.id}')"
                    >
                        Choose Plan
                    </button>

                </div>
            `;

        }).join("");


    } catch (error) {

        console.error(error);

        membershipPlans.innerHTML = `
            <p>
                Unable to load membership plans.
            </p>
        `;
    }
}


// ==========================================
// CHOOSE PLAN
// ==========================================

function choosePlan(planId) {

    sessionStorage.setItem(
        "selectedMembershipPlan",
        planId
    );

    const plans =
        JSON.parse(
            sessionStorage.getItem("membershipPlans") || "[]"
        );

    const selectedPlan =
        plans.find(plan => plan.id === planId);

    if (!selectedPlan) {
        alert("Unable to find the selected plan.");
        return;
    }

    const price =
        (Number(selectedPlan.priceCents || 0) / 100)
        .toFixed(2);

    const renewalPlans =
        document.getElementById("renewalPlans");

    if (!renewalPlans) {
        return;
    }

    renewalPlans.innerHTML = `
        <div class="renewal-confirmation">

            <h3>Confirm Your Renewal</h3>

            <p>
                You selected:
                <strong>${selectedPlan.name}</strong>
            </p>

            <p>
                Membership Price:
                <strong>RM ${price}</strong>
            </p>

            <p>
                Your renewal request will be sent to the admin
                for approval.
            </p>

            <button
                type="button"
                onclick="submitRenewalRequest()"
            >
                Submit Renewal Request
            </button>

        </div>
    `;
}

function startRenewal() {
    sessionStorage.setItem("renewalMode", "true");

    const renewalSection = document.getElementById("renewalSection");

    if (renewalSection) {
        renewalSection.style.display = "block";
        renewalSection.scrollIntoView({
            behavior: "smooth",
            block: "start"
        });
    }
}


// ==========================================
// START
// ==========================================

loadMembership();
loadPlans();

async function submitRenewalRequest() {

    const selectedPlan =
        sessionStorage.getItem("selectedMembershipPlan");

    if (!selectedPlan) {
        alert("Please select a membership plan first.");
        return;
    }

    const receiptInput = document.getElementById("renewalReceipt");
    const receipt = receiptInput?.files[0];
    if (!receipt || !["image/jpeg", "image/png", "image/webp"].includes(receipt.type)
        || receipt.size === 0 || receipt.size > 5 * 1024 * 1024) {
        document.getElementById("renewalMessage").textContent =
            "Choose a JPEG, PNG or WebP payment receipt smaller than 5 MB.";
        return;
    }

    try {

        const formData = new FormData();

        formData.append("action", "renew");
        formData.append("planId", selectedPlan);
        formData.append("receipt", receipt);

        const response = await fetch(
            `${API_BASE_URL}/api/member-app`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`
                },
                body: formData
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Unable to submit renewal request."
            );
        }

        alert(
            "Renewal request submitted successfully. Please wait for admin approval."
        );

        sessionStorage.removeItem("selectedMembershipPlan");
        sessionStorage.removeItem("renewalMode");

        window.location.reload();

    } catch (error) {

        console.error(error);

        alert(
            error.message ||
            "Unable to submit renewal request."
        );
    }
}
