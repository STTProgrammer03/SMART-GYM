const API_BASE_URL = "http://localhost:3000";

const loginForm = document.getElementById("loginForm");
const message = document.getElementById("message");

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