const configuredApiBaseUrl =
    ["localhost", "127.0.0.1", "[::1]", "::1"].includes(window.location.hostname)
        ? "http://localhost:3000"
        : "https://membership-api.smartgogo.net";

window.MEMBER_API_BASE_URL = configuredApiBaseUrl;
