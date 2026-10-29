let currentEqId = null;
let currentPrice = 0;
let equipmentCache = {};

document.addEventListener("DOMContentLoaded", async () => {
    await updateAuthUI(); // Ждем, пока проверим, кто зашел
    loadEquipment();
});

async function updateAuthUI() {
    const panel = document.getElementById("auth-panel");
    const user = await getCurrentUser(); // Запрашиваем данные с бэка

    if (user) {
        // Если зашел админ или менеджер, показываем кнопку панели управления
        let adminBtn = (user.role === "admin" || user.role === "manager") 
            ? `<a href="/admin.html" class="btn btn-success" style="text-decoration:none; margin-right:5px;">Панель управления</a>` 
            : "";
            
        panel.innerHTML = `
            <span style="margin-right: 15px;">Привет, <b>${user.username}</b></span>
            <button class="btn" style="margin-right:5px; background:#2ecc71;" onclick="showMyBookings()">Мои аренды</button>
            ${adminBtn}
            <button class="btn btn-danger" onclick="logout()">Выйти</button>
        `;
    } else {
        panel.innerHTML = `<button class="btn" onclick="openModal('login-modal')">Войти</button>`;
    }
}

function openModal(id) { document.getElementById(id).style.display = 'flex'; }
function closeModal(id) { document.getElementById(id).style.display = 'none'; }
function switchModal(closeId, openId) { closeModal(closeId); openModal(openId); }

// ФУНКЦИЯ ВХОДА
async function doLogin() {
    const u = document.getElementById("login-username").value;
    const p = document.getElementById("login-password").value;
    
    if (!u || !p) return alert("Заполните все поля");

    if (await loginUser(u, p)) {
        window.location.reload(); // Перезагружаем страницу, чтобы обновить UI
    } else {
        alert("Неверный логин или пароль!");
    }
}

// ФУНКЦИЯ РЕГИСТРАЦИИ
async function doRegister() {
    const u = document.getElementById("reg-username").value;
    const p = document.getElementById("reg-password").value;

    if (!u || !p) return alert("Заполните все поля");

    try {
        // Отправляем только логин и пароль. Роль бэкенд сам сделает "client"
        await apiRequest("/register", "POST", { username: u, password: p });
        alert("Аккаунт создан! Теперь войдите.");
        switchModal('register-modal', 'login-modal');
    } catch (e) {
        alert("Ошибка регистрации: " + e.message);
    }
}

async function loadEquipment() {
    const search = document.getElementById("search").value;
    const category = document.getElementById("category-filter").value;
    
    let url = `/equipment?search=${search}&category=${category}`;
    try {
        const data = await apiRequest(url);
        const catalog = document.getElementById("catalog");
        catalog.innerHTML = "";
        
        // Очищаем кэш перед загрузкой
        equipmentCache = {};

        data.forEach(eq => {
            // Сохраняем в кэш
            equipmentCache[eq.id] = eq; 

            catalog.innerHTML += `
                <div class="card">
                    <img src="${eq.image_url}" style="width:100%; height:150px; object-fit:cover; border-radius:5px; margin-bottom:10px;">
                    <h3>${eq.name}</h3>
                    <p>Категория: ${eq.category}</p>
                    <p>Цена: <b>${eq.price_per_day} руб/день</b></p>
                    <!-- ПЕРЕДАЕМ ТОЛЬКО ID -->
                    <button class="btn" style="width: 100%;" onclick="openBooking(${eq.id})">Забронировать</button>
                </div>
            `;
        });
    } catch (e) {
        console.error(e);
    }
}

function openBooking(id) {
    if (!getToken()) return alert("Необходимо войти в систему!");
    
    const eq = equipmentCache[id];
    if (!eq) return alert("Ошибка данных оборудования");

    currentEqId = id;
    currentPrice = eq.price_per_day;
    document.getElementById("eq-name").innerText = eq.name;
    openModal('booking-modal');
}

function calcPrice() {
    const start = new Date(document.getElementById("start-date").value);
    const end = new Date(document.getElementById("end-date").value);
    if (start && end && start < end) {
        const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
        document.getElementById("total-price").innerText = days * currentPrice;
    } else {
        document.getElementById("total-price").innerText = "0";
    }
}

async function submitBooking() {
    const start = document.getElementById("start-date").value;
    const end = document.getElementById("end-date").value;
    
    try {
        await apiRequest("/bookings", "POST", { equipment_id: currentEqId, start_date: start, end_date: end });
        alert("Успешно забронировано! Ожидайте подтверждения менеджера.");
        closeModal('booking-modal');
    } catch (e) {
        alert("Ошибка: " + e.message);
    }
}

async function showMyBookings() {
    try {
        const bookings = await apiRequest("/my-bookings");
        const tbody = document.getElementById("my-bookings-body");
        tbody.innerHTML = "";
        if (bookings.length === 0) tbody.innerHTML = "<tr><td colspan='4'>У вас пока нет аренд</td></tr>";
        
        bookings.forEach(b => {
            let badgeClass = "badge-pending";
            if (b.status === "выдано") badgeClass = "badge-issued";
            if (b.status === "возвращено") badgeClass = "badge-returned";
            if (b.status === "просрочено") badgeClass = "badge-overdue";
            if (b.status === "подтверждено") badgeClass = "badge-issued"; // Переиспользуем синий цвет

            tbody.innerHTML += `
                <tr>
                    <td>ID: ${b.equipment_id}</td>
                    <td>${b.start_date} - ${b.end_date}</td>
                    <td>${b.total_price} руб. <br><small style="color:red">Штраф: ${b.penalty} руб.</small></td>
                    <td><span class="badge ${badgeClass}">${b.status}</span></td>
                </tr>
            `;
        });
        openModal('my-bookings-modal');
    } catch (e) { alert(e.message); }
}
