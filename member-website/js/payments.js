const API_BASE_URL = window.MEMBER_API_BASE_URL || "";
const token = sessionStorage.getItem("memberToken");
const workspace = sessionStorage.getItem("workspace");
const message = document.getElementById("paymentMessage");
const list = document.getElementById("paymentList");
const search = document.getElementById("paymentSearch");
const filter = document.getElementById("paymentStatusFilter");
let allPayments = [];

if (!token) window.location.replace("index.html");

function money(cents) { return "RM " + (Number(cents || 0) / 100).toFixed(2); }
function date(value) { return value ? new Date(value).toLocaleString("en-MY", { dateStyle: "medium", timeStyle: "short" }) : "-"; }
function label(value) { return String(value || "UNKNOWN").replaceAll("_", " "); }

function renderPayments() {
    const query = search.value.trim().toLowerCase();
    const selected = filter.value;
    const payments = allPayments.filter(p =>
        (!query || String(p.invoiceNo || "").toLowerCase().includes(query)) &&
        (selected === "ALL" || String(p.paymentStatus || "UNKNOWN").toUpperCase() === selected)
    );
    message.textContent = payments.length ? "" : "No matching payment transactions found.";
    list.replaceChildren(...payments.map(payment => {
        const item = document.createElement("article");
        item.className = "payment-history-item";
        item.dataset.status = String(payment.paymentStatus || "UNKNOWN").toLowerCase();
        const title = document.createElement("h3");
        title.textContent = label(payment.planName || payment.kind || "Membership Payment");
        const invoice = document.createElement("p");
        invoice.className = "payment-invoice";
        invoice.textContent = "Invoice: " + label(payment.invoiceNo);
        const meta = document.createElement("p");
        meta.className = "payment-meta";
        meta.textContent = "▣ " + date(payment.createdAt) + " · " + label(payment.paymentMethod);
        const amount = document.createElement("strong");
        amount.className = "payment-amount";
        amount.textContent = money(payment.amountCents);
        const badge = document.createElement("span");
        badge.className = "payment-status-badge";
        badge.textContent = label(payment.paymentStatus);
        const arrow = document.createElement("span");
        arrow.className = "payment-arrow";
        arrow.textContent = "›";
        item.append(title, invoice, meta, amount, badge, arrow);
        return item;
    }));
}

async function loadPayments() {
    try {
        const response = await fetch(API_BASE_URL + "/api/member-app?view=payments", {
            headers: { Authorization: "Bearer " + token, ...(workspace ? { "X-Workspace": workspace } : {}) }
        });
        if (response.status === 401) {
            sessionStorage.removeItem("memberToken");
            window.location.replace("index.html");
            return;
        }
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "Unable to load payment history.");
        allPayments = data.payments || [];
        document.getElementById("totalCount").textContent = allPayments.length;
        document.getElementById("paidCount").textContent = allPayments.filter(p => p.paymentStatus === "PAID").length;
        document.getElementById("pendingCount").textContent = allPayments.filter(p => p.paymentStatus === "PENDING").length;
        document.getElementById("unknownCount").textContent = allPayments.filter(p => !["PAID", "PENDING", "FAILED"].includes(p.paymentStatus)).length;
        renderPayments();
        /*
        list.replaceChildren(...allPayments.map(payment => {
            const item = document.createElement("div");
            item.className = "dashboard-section payment-history-item";
            item.dataset.status = String(payment.paymentStatus || "UNKNOWN").toLowerCase();
            const title = document.createElement("h3");
            title.textContent = label(payment.planName || payment.kind || "Membership Payment");
            const amount = document.createElement("p");
            amount.textContent = `${money(payment.amountCents)} · ${label(payment.paymentStatus)}`;
            const details = document.createElement("p");
            details.textContent = `${label(payment.paymentMethod)} · ${date(payment.createdAt)}`;
            const invoice = document.createElement("p");
            invoice.textContent = `Invoice: ${label(payment.invoiceNo)}`;
            item.append(title, amount, details, invoice);
            return item;
        }));*/
    } catch (error) { message.textContent = error.message; }
}
loadPayments();
search.addEventListener("input", renderPayments);
filter.addEventListener("change", renderPayments);
document.getElementById("downloadPayments").addEventListener("click", () => {
    const rows = [["Plan", "Invoice", "Amount", "Status", "Method", "Date"], ...allPayments.map(p => [p.planName || p.kind || "Membership Payment", p.invoiceNo || "", money(p.amountCents), p.paymentStatus || "UNKNOWN", p.paymentMethod || "", date(p.createdAt)])];
    const csv = rows.map(row => row.map(value => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    link.download = "payment-history.csv";
    link.click();
    URL.revokeObjectURL(link.href);
});
