const form = document.getElementById('paymentForm');
const cardDetails = document.getElementById('cardDetails');
const statusBox = document.getElementById('status');
const button = document.querySelector('.pay-button');

document.querySelectorAll('input[name="method"]').forEach((input) => {
  input.addEventListener('change', () => {
    cardDetails.classList.toggle('hidden', input.value !== 'card' || !input.checked);
    button.textContent = input.value === 'manual' ? 'Submit for Staff Approval (Demo)' : 'Pay RM 60.00 (Demo)';
  });
});

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const method = new FormData(form).get('method');
  const reference = `DEMO-${Date.now().toString().slice(-8)}`;
  const methodName = { card: 'Debit / Credit Card', tng: 'Touch ’n Go eWallet', duitnow: 'DuitNow QR', manual: 'Pay at gym counter' }[method];
  statusBox.className = 'status success';
  statusBox.innerHTML = `<strong>Demo payment successful</strong><br>${methodName}<br>Reference: ${reference}<br><small>In the real version, this will be replaced by provider verification.</small>`;
  button.disabled = true;
  button.textContent = 'Payment Complete';
});
