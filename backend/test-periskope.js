const apiKey = process.env.PERISKOPE_API_KEY;
const baseUrl = process.env.PERISKOPE_BASE_URL;
const senderPhone = process.env.PERISKOPE_PHONE;

// CHANGE THIS to your own WhatsApp number
const recipientPhone = "601153549903";

const response = await fetch(`${baseUrl}/message/send`, {
    method: "POST",
    headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "x-phone": senderPhone
    },
    body: JSON.stringify({
        chat_id: `${recipientPhone}@c.us`,
        message: "Test message from U FITNESS GYM member portal."
    })
});

const data = await response.text();

console.log("Status:", response.status);
console.log("Response:", data);