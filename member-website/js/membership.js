const API_BASE_URL =
    ["localhost", "127.0.0.1", "[::1]", "::1"].includes(window.location.hostname)
        ? "http://localhost:3000"
        : "https://membership-api.smartgogo.net";

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
    "Authorization": `Bearer ${token}`,
    "X-Workspace": sessionStorage.getItem("workspace") || ""
}
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Failed to load membership."
            );
        }

        // Fill the welcome section with the authenticated member's data.
        const memberName = document.getElementById("memberNameHeading");
        const memberPhoto = document.getElementById("memberPhoto");
        const workspace = sessionStorage.getItem("workspace") || "";
        const authHeaders = {
            Authorization: `Bearer ${token}`,
            ...(workspace ? { "X-Workspace": workspace } : {})
        };

        memberName.textContent = data.name || "Member";
        memberPhoto.alt = `${data.name || "Member"} profile photo`;

        if (data.photoKey) {
            try {
                const photoResponse = await fetch(
                    `${API_BASE_URL}/api/member-app?view=photo`,
                    { headers: authHeaders }
                );
                if (!photoResponse.ok) throw new Error("Photo unavailable");
                const photoUrl = URL.createObjectURL(await photoResponse.blob());
                memberPhoto.onload = () => URL.revokeObjectURL(photoUrl);
                memberPhoto.src = photoUrl;
            } catch (photoError) {
                console.warn("Unable to load member photo:", photoError);
            }
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

let renewalWarning = "";

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


// ==========================================
// RENEWAL WARNING
// ==========================================


if (days >= 0 && days <= 3) {

    if (days === 0) {

        renewalWarning = `
            <div class="membership-renewal-warning">
                <strong>🔴 Membership Expires Today</strong>
                <p>Your membership expires today. Renew now to continue.</p>
                <button
                    type="button"
                    onclick="startRenewal()"
                >
                    Renew Membership
                </button>
            </div>
        `;

    } else {

        renewalWarning = `
            <div class="membership-renewal-warning">
                <strong>🟠 Membership Expiring Soon</strong>
                <p>
                    Your membership expires in
                    <strong>${days} day${days === 1 ? "" : "s"}</strong>.
                </p>

                <button
                    type="button"
                    onclick="startRenewal()"
                >
                    Renew Membership
                </button>
            </div>
        `;

    }
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

            ${renewalWarning}


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
                    "Authorization": `Bearer ${token}`,
                    "X-Workspace": sessionStorage.getItem("workspace") || ""
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

console.table(
    plans.map(p => ({
        id: p.id,
        name: p.name,
        priceCents: p.priceCents
    }))
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
                Membership Plan:
                <strong>${selectedPlan.name}</strong>
            </p>

            <p>
                Renewal Price:
                <strong>RM ${price}</strong>
            </p>

            <p>
                Please review your membership plan before continuing to payment.
            </p>

            <button
                type="button"
                onclick="continueRenewalPayment()"
            >
                Pay Now
            </button>

        </div>
    `;
}

async function continueRenewalPayment() {

    const selectedPlanId =
        sessionStorage.getItem("selectedMembershipPlan");

    if (!selectedPlanId) {
        alert("Please select a membership plan first.");
        return;
    }

    const plans =
        JSON.parse(
            sessionStorage.getItem("membershipPlans") || "[]"
        );

    const selectedPlan =
        plans.find(plan => plan.id === selectedPlanId);

    if (!selectedPlan) {
        alert("Unable to find the selected membership plan.");
        return;
    }

    await submitRenewalRequest();
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

async function loadMembershipTransactions() {
    const container = document.getElementById("membershipTransactionHistory");
    if (!container) return;

    try {
        const workspace = sessionStorage.getItem("workspace") || "";
        const response = await fetch(`${API_BASE_URL}/api/member-app?view=payments`, {
            headers: {
                Authorization: `Bearer ${token}`,
                ...(workspace ? { "X-Workspace": workspace } : {})
            }
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load transactions.");

        const payments = data.payments || [];
        if (!payments.length) {
            container.innerHTML = "<p>No membership transactions found.</p>";
            return;
        }

        const money = cents => `RM${(Number(cents || 0) / 100).toFixed(2)}`;
        const formatDate = value => value
            ? new Date(value).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })
            : "-";

        container.innerHTML = payments.slice(0, 2).map(payment => `
            <div class="membership-transaction-row">
                <div>
                    <strong>${payment.planName || payment.kind || "Membership Payment"}</strong>
                    <small>${formatDate(payment.createdAt)} · ${payment.paymentMethod || "Payment"}</small>
                </div>
                <div class="membership-transaction-total">
                    <strong>${money(payment.amountCents)}</strong>
                    <span class="membership-transaction-status">${payment.paymentStatus || "Unknown"}</span>
                </div>
            </div>
        `).join("");
    } catch (error) {
        container.innerHTML = `<p>Unable to load transaction history.</p>`;
        console.error(error);
    }
}

loadMembership();
loadPlans();
loadMembershipTransactions();

async function submitRenewalRequest() {
    const selectedPlan =
        sessionStorage.getItem("selectedMembershipPlan");

    if (!selectedPlan) {
        alert("Please select a membership plan first.");
        return;
    }

    const plans = JSON.parse(
        sessionStorage.getItem("membershipPlans") || "[]"
    );

    const planDetails = plans.find(
        plan => plan.id === selectedPlan
    );

    if (!planDetails) {
        alert("Unable to find the selected membership plan.");
        return;
    }

    const renewalMessage =
        document.getElementById("renewalMessage");

    try {
        const formData = new FormData();

        formData.append("action", "renew");
        formData.append("planId", selectedPlan);

        const response = await fetch(
            `${API_BASE_URL}/api/member-app`,
            {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "X-Workspace":
                        sessionStorage.getItem("workspace") || ""
                },
                body: formData
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Unable to create renewal request."
            );
        }

        if (!data.id) {
            throw new Error(
                "Renewal request was created but no request ID was returned."
            );
        }

        sessionStorage.removeItem("selectedMembershipPlan");
        sessionStorage.removeItem("renewalMode");

        const paymentUrl = new URL(
            "payment.html",
            window.location.href
        );

        paymentUrl.searchParams.set("type", "renewal");
        paymentUrl.searchParams.set("requestId", data.id);
        paymentUrl.searchParams.set(
            "plan",
            planDetails.name
        );
        paymentUrl.searchParams.set(
            "amount",
            (Number(planDetails.priceCents || 0) / 100).toFixed(2)
        );

        window.location.href = paymentUrl.toString();
    } catch (error) {
        console.error(error);

        if (renewalMessage) {
            renewalMessage.textContent =
                error.message || "Unable to create renewal request.";
        } else {
            alert(
                error.message || "Unable to create renewal request."
            );
        }
    }
}
