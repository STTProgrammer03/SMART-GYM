const API_BASE_URL = window.MEMBER_API_BASE_URL || "";

const token = sessionStorage.getItem("memberToken");


// Check login

if (!token) {

    window.location.href = "index.html";

}


// Load member profile

async function loadProfile() {

    try {

        const response = await fetch(
            `${API_BASE_URL}/api/member-app?view=me`,
            {
               headers: {
    Authorization: `Bearer ${token}`,
    "X-Workspace": sessionStorage.getItem("workspace") || ""
}
            }
        );


        const data = await response.json();


        if (!response.ok) {

            throw new Error(
                data.error || "Unable to load profile."
            );

        }


        // Member information

        document.getElementById("profileName").textContent =
            data.name || "—";


        document.getElementById("profileMemberId").textContent =
            `Member ID: ${data.memberId || "—"}`;


        document.getElementById("profileFullName").textContent =
            data.name || "—";


        document.getElementById("profilePhone").textContent =
            data.phone || "—";


        document.getElementById("profileEmail").textContent =
            data.email || "—";


        document.getElementById("profileBirthDate").textContent =
            data.birthDate || "—";


        document.getElementById("profileId").textContent =
            data.memberId || "—";

            // ==========================================
// LOAD REAL PROFILE PHOTO
// ==========================================

const profilePhoto =
    document.getElementById("profilePhoto");

const profileIcon =
    document.getElementById("profileIcon");

if (data.photoKey) {

    try {

        const photoResponse = await fetch(
            `${API_BASE_URL}/api/member-app?view=photo`,
            {
                method: "GET",
                headers: {
                    Authorization: `Bearer ${token}`,
                    "X-Workspace": sessionStorage.getItem("workspace") || ""
                }
            }
        );


        if (!photoResponse.ok) {
            throw new Error("Photo unavailable.");
        }


        const photoBlob =
            await photoResponse.blob();


        const photoUrl =
            URL.createObjectURL(photoBlob);


        profilePhoto.src = photoUrl;

        profilePhoto.style.display =
            "block";

        profileIcon.style.display =
            "none";


    } catch (error) {

        console.error(
            "Unable to load profile photo:",
            error
        );

        profilePhoto.style.display =
            "none";

        profileIcon.style.display =
            "flex";

    }

}

    } catch (error) {

        console.error(error);

        alert(error.message);

    }

}


loadProfile();
