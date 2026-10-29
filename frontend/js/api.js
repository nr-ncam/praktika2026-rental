const API_URL = "";

function getToken() { return localStorage.getItem("token"); }

function logout() {
    localStorage.removeItem("token");
    window.location.href = "/index.html";
}

// Базовый запрос
async function apiRequest(endpoint, method = "GET", body = null) {
    const headers = { "Content-Type": "application/json" };
    const token = getToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;

    const config = { method, headers };
    if (body) config.body = JSON.stringify(body);

    const response = await fetch(`${API_URL}${endpoint}`, config);
    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Ошибка запроса");
    }
    return response.json();
}

// Вход (только получение токена)
async function loginUser(username, password) {
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);

    const res = await fetch(`${API_URL}/token`, { method: 'POST', body: formData });
    if (res.ok) {
        const data = await res.json();
        localStorage.setItem("token", data.access_token);
        return true;
    }
    return false;
}

// Получение текущего пользователя (для проверки роли)
async function getCurrentUser() {
    if (!getToken()) return null;
    try {
        return await apiRequest("/users/me");
    } catch (e) {
        logout(); // Если токен протух - выходим
        return null;
    }
}