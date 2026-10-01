const API_BASE_URL = "http://localhost:3000";

const token = sessionStorage.getItem("memberToken");


// Check login

if (!token) {
    window.location.href = "index.html";
}


// ==========================================
// LOAD PROFILE
// ==========================================

async function loadProfile() {

    try {

        const response = await fetch(
            `${API_BASE_URL}/api/member-app?view=me`,
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );

        const data = await response.json();

        if (!response.ok) {
            throw new Error(
                data.error || "Unable to load profile."
            );
        }


        document.getElementById("fullName").value =
            data.name || "";

        document.getElementById("phone").value =
            data.phone || "";

        document.getElementById("email").value =
            data.email || "";

        document.getElementById("birthDate").value =
            data.birthDate || "";

        document.getElementById("memberId").value =
            data.memberId || "";


    } catch (error) {

        console.error(error);

        document.getElementById(
            "editProfileMessage"
        ).textContent = error.message;

    }

}


// ==========================================
// SAVE PROFILE
// ==========================================

const editProfileForm =
    document.getElementById("editProfileForm");


editProfileForm.addEventListener(
    "submit",
    async (event) => {

        event.preventDefault();


        const message =
            document.getElementById(
                "editProfileMessage"
            );


        const email =
            document.getElementById("email").value.trim();


        const birthDate =
            document.getElementById("birthDate").value;


        message.textContent =
            "Saving changes...";


        const formData =
            new FormData();


        formData.append(
            "action",
            "update-profile"
        );

        formData.append(
    "name",
    document.getElementById("fullName").value
);

formData.append(
    "phone",
    document.getElementById("phone").value
);


        formData.append(
            "email",
            email
        );


        formData.append(
            "birthDate",
            birthDate
        );

        const photoInput = document.getElementById("photo");

if (photoInput.files.length > 0) {
    formData.append("photo", photoInput.files[0]);
}


        try {

            const response = await fetch(
                `${API_BASE_URL}/api/member-app`,
                {
                    method: "POST",

                    headers: {
                        Authorization:
                            `Bearer ${token}`
                    },

                    body: formData
                }
            );


            const data =
                await response.json();


            if (!response.ok) {

                throw new Error(
                    data.error ||
                    "Unable to save profile."
                );

            }


           message.textContent = "";

showProfileSuccessPopup();


        } catch (error) {

            console.error(error);

            message.textContent =
                error.message;

            message.style.color =
                "#dc3545";

        }

    }
);


// Start

loadProfile();

// Load current member information

async function loadProfile() {

    try {

        const response = await fetch(
            `${API_BASE_URL}/api/member-app?view=me`,
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`
                }
            }
        );


        const data = await response.json();


        if (!response.ok) {

            throw new Error(
                data.error || "Unable to load profile."
            );

        }


        // Fill the form

        document.getElementById("fullName").value =
            data.name || "";


        document.getElementById("phone").value =
            data.phone || "";


        document.getElementById("email").value =
            data.email || "";


        document.getElementById("birthDate").value =
            data.birthDate || "";


        document.getElementById("memberId").value =
            data.memberId || "";


        // ==========================================
        // LOAD REAL PROFILE PHOTO
        // ==========================================

const profilePhoto =
    document.getElementById("profilePhoto");

const profileIcon =
    document.getElementById("profileIcon");

if (data.photoKey) {

    profilePhoto.src =
        `${API_BASE_URL}/api/member-app?view=photo`;

    profilePhoto.style.display = "block";

    profileIcon.style.display = "none";


    profilePhoto.onerror = () => {

        profilePhoto.style.display = "none";

        profileIcon.style.display = "flex";

    };

}


    } catch (error) {

        console.error(error);

        document.getElementById(
            "editProfileMessage"
        ).textContent = error.message;

    }

}




loadProfile();

function showProfileSuccessPopup() {

    const popup = document.createElement("div");

    popup.className = "profile-success-overlay";

    popup.innerHTML = `
        <div class="profile-success-popup">

            <div class="profile-success-icon">
                ✓
            </div>

            <h2>
                Profile Saved!
            </h2>

            <p>
                Your profile has been updated successfully.
            </p>

            <button id="profileSuccessOk">
                OK
            </button>

        </div>
    `;

    document.body.appendChild(popup);


    document
        .getElementById("profileSuccessOk")
        .addEventListener("click", () => {

            window.location.href =
                "profile.html";

        });

}