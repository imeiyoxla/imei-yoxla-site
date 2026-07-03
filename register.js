"use strict";

const SERVER_URL = "https://imei-backend-m9i9.onrender.com";
const REQUEST_TIMEOUT_MS = 30000;

const registrationForm = document.getElementById("registration-form");
const verificationForm = document.getElementById("verification-form");
const successPanel = document.getElementById("success-panel");
const registrationMessage = document.getElementById("registration-message");
const verificationMessage = document.getElementById("verification-message");
const registrationSubmit = document.getElementById("registration-submit");
const verificationSubmit = document.getElementById("verification-submit");
const deviceWarning = document.getElementById("device-warning");
const verificationEmail = document.getElementById("verification-email");
const otpCode = document.getElementById("otp-code");

const fragment = new URLSearchParams(window.location.hash.slice(1));
const deviceId = (fragment.get("device_id") || "").trim();

// The Android ID is needed only in memory. Remove it from the visible URL immediately.
if (window.location.hash) {
    window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
}

let pendingRegistration = null;

if (!deviceId) {
    deviceWarning.hidden = false;
    registrationSubmit.disabled = true;
}

document.querySelectorAll("[data-password-toggle]").forEach((button) => {
    button.addEventListener("click", () => {
        const input = document.getElementById(button.dataset.passwordToggle);
        const showPassword = input.type === "password";
        input.type = showPassword ? "text" : "password";
        button.setAttribute("aria-label", showPassword ? "Şifrəni gizlət" : "Şifrəni göstər");
        button.querySelector("i").className = showPassword ? "fa-regular fa-eye-slash" : "fa-regular fa-eye";
    });
});

registrationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage(registrationMessage);

    if (!deviceId) {
        showMessage(registrationMessage, "Qeydiyyat səhifəsini IMEI Yoxla tətbiqindən açın.");
        return;
    }

    const username = document.getElementById("username").value.trim();
    const email = document.getElementById("email").value.trim();
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirm-password").value;

    const validationError = validateRegistration({ username, email, password, confirmPassword });
    if (validationError) {
        showMessage(registrationMessage, validationError);
        return;
    }

    setLoading(registrationSubmit, true, "Göndərilir...");

    try {
        const result = await postJson("/register", {
            username,
            email,
            password,
            device_id: deviceId
        });

        if (result.status !== "success") {
            throw new Error(result.message || "OTP kodunu göndərmək mümkün olmadı.");
        }

        pendingRegistration = { username, email, password, device_id: deviceId };
        verificationEmail.textContent = email;
        showVerificationStep();
    } catch (error) {
        showMessage(registrationMessage, friendlyError(error));
    } finally {
        setLoading(registrationSubmit, false, "OTP kodu göndər");
    }
});

verificationForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearMessage(verificationMessage);

    if (!pendingRegistration) {
        showRegistrationStep();
        return;
    }

    const code = otpCode.value.replace(/\D/g, "");
    otpCode.value = code;

    if (code.length < 4) {
        showMessage(verificationMessage, "E-poçtunuza göndərilən OTP kodunu daxil edin.");
        return;
    }

    setLoading(verificationSubmit, true, "Yoxlanılır...");

    try {
        const result = await postJson("/verify", {
            username: pendingRegistration.username,
            password: pendingRegistration.password,
            device_id: pendingRegistration.device_id,
            code
        });

        if (result.status !== "success") {
            throw new Error(result.message || "OTP kodu yanlışdır.");
        }

        pendingRegistration.password = "";
        document.getElementById("password").value = "";
        document.getElementById("confirm-password").value = "";
        showSuccessStep();
    } catch (error) {
        showMessage(verificationMessage, friendlyError(error));
    } finally {
        setLoading(verificationSubmit, false, "Hesabı təsdiqlə");
    }
});

otpCode.addEventListener("input", () => {
    otpCode.value = otpCode.value.replace(/\D/g, "").slice(0, 8);
    clearMessage(verificationMessage);
});

document.getElementById("back-to-registration").addEventListener("click", showRegistrationStep);

function validateRegistration({ username, email, password, confirmPassword }) {
    if (!username || !email || !password || !confirmPassword) {
        return "Bütün sahələri doldurun.";
    }
    if (username.length < 3) {
        return "İstifadəçi adı ən azı 3 simvol olmalıdır.";
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return "Düzgün e-poçt ünvanı daxil edin.";
    }
    if (password.length < 6) {
        return "Şifrə ən azı 6 simvol olmalıdır.";
    }
    if (password !== confirmPassword) {
        return "Şifrələr uyğun gəlmir.";
    }
    return "";
}

async function postJson(endpoint, payload) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
        // text/plain keeps this request CORS-simple. The existing server still parses the JSON body.
        const response = await fetch(`${SERVER_URL}${endpoint}`, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=UTF-8" },
            body: JSON.stringify(payload),
            signal: controller.signal
        });

        const result = await response.json().catch(() => null);
        if (!response.ok || !result) {
            throw new Error(result?.message || `Server xətası: ${response.status}`);
        }
        return result;
    } finally {
        window.clearTimeout(timeout);
    }
}

function friendlyError(error) {
    if (error?.name === "AbortError") {
        return "Server gec cavab verir. Bir az sonra yenidən cəhd edin.";
    }
    if (!navigator.onLine) {
        return "İnternet bağlantınızı yoxlayın.";
    }
    return error?.message || "Xəta baş verdi. Yenidən cəhd edin.";
}

function showRegistrationStep() {
    registrationForm.hidden = false;
    verificationForm.hidden = true;
    successPanel.hidden = true;
    setActiveStep(1);
    clearMessage(verificationMessage);
}

function showVerificationStep() {
    registrationForm.hidden = true;
    verificationForm.hidden = false;
    successPanel.hidden = true;
    setActiveStep(2);
    window.setTimeout(() => otpCode.focus(), 0);
}

function showSuccessStep() {
    registrationForm.hidden = true;
    verificationForm.hidden = true;
    successPanel.hidden = false;
    document.querySelector(".steps").hidden = true;
    deviceWarning.hidden = true;
}

function setActiveStep(number) {
    document.querySelectorAll("[data-step-indicator]").forEach((step) => {
        const stepNumber = Number(step.dataset.stepIndicator);
        step.classList.toggle("is-active", stepNumber === number);
        step.classList.toggle("is-complete", stepNumber < number);
    });
}

function setLoading(button, loading, label) {
    button.disabled = loading || (button === registrationSubmit && !deviceId);
    button.querySelector("span").textContent = label;
}

function showMessage(element, message, success = false) {
    element.textContent = message;
    element.classList.toggle("is-success", success);
}

function clearMessage(element) {
    showMessage(element, "");
}
