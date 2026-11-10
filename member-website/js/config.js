(function () {
    const local = ["localhost", "127.0.0.1"].includes(window.location.hostname);
    window.MEMBER_API_BASE_URL = local ? "http://localhost:3000" : "";

    // Keep older page scripts working after deployment by rewriting any
    // remaining localhost API URLs to the deployed site's same origin.
    if (!local) {
        const originalFetch = window.fetch.bind(window);
        window.fetch = (input, init) => {
            if (typeof input === "string") {
                input = input.replace(/^http:\/\/localhost:3000/, "");
            } else if (input instanceof Request) {
                const url = input.url.replace(/^http:\/\/localhost:3000/, window.location.origin);
                input = new Request(url, input);
            }
            return originalFetch(input, init);
        };
    }
})();
