let myChart = null;
let equipmentAdminCache = {};

document.addEventListener("DOMContentLoaded", async () => {
    const user = await getCurrentUser(); // Получаем инфу о себе

    if (!user || (user.role !== "admin" && user.role !== "manager")) {
        alert("Доступ запрещен!");
        window.location.href = "/index.html";
        return;
    }

    if (user.role === "admin") {
        document.getElementById('admin-only-block').style.display = 'block';
        document.getElementById('admin-users-block').style.display = 'block';
        document.getElementById('admin-stats-block').style.display = 'block';
        
        loadUsers(); 
        loadStats();
        loadEquipmentAdmin(); 
    }

    loadBookings();
});

async function loadStats() {
    try {
        const stats = await apiRequest("/admin/stats");
        document.getElementById("stat-total").innerText = stats.total_bookings;
        document.getElementById("stat-revenue").innerText = stats.revenue;
        document.getElementById("stat-penalties").innerText = stats.penalties;

        const ctx = document.getElementById('statsChart').getContext('2d');
        
        // УНИЧТОЖАЕМ СТАРЫЙ ГРАФИК, ЕСЛИ ОН ЕСТЬ
        if (myChart) {
            myChart.destroy();
        }

        // Рисуем новый
        myChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: Object.keys(stats.status_counts),
                datasets: [{
                    label: 'Количество бронирований по статусам',
                    data: Object.values(stats.status_counts),
                    backgroundColor: ['#f1c40f', '#3498db', '#2ecc71', '#e74c3c']
                }]
            }
        });
    } catch(e) { console.error(e); }
}

async function loadBookings() {
    try {
        const currentUser = await getCurrentUser();
        const isAdmin = currentUser && currentUser.role === "admin";
        
        const bookings = await apiRequest("/admin/bookings");
        const tbody = document.getElementById("bookings-table-body");
        tbody.innerHTML = "";

        if (bookings.length === 0) {
            tbody.innerHTML = "<tr><td colspan='7' style='text-align:center;'>Нет бронирований</td></tr>";
            return;
        }

        bookings.forEach(b => {
            let badgeClass = "badge-pending";
            if (b.status === "подтверждено") badgeClass = "badge-issued";
            if (b.status === "выдано") badgeClass = "badge-issued";
            if (b.status === "возвращено") badgeClass = "badge-returned";
            if (b.status === "просрочено") badgeClass = "badge-overdue";

            const deleteBtn = isAdmin ? `<button class="btn btn-danger" style="padding:5px; font-size:11px; margin-top:5px;" onclick="deleteBooking(${b.id})">Удалить</button>` : "";

            tbody.innerHTML += `
                <tr>
                    <td>${b.id}</td>
                    <td>User ID: ${b.user_id}</td>
                    <td>Eq ID: ${b.equipment_id}</td>
                    <td>${b.start_date} - ${b.end_date}</td>
                    <td>${b.total_price} руб. <br><small style="color:red">Штраф: ${b.penalty} руб.</small></td>
                    <td><span class="badge ${badgeClass}">${b.status}</span></td>
                    <td>
                        <select onchange="updateStatus(${b.id}, this.value)" style="margin-bottom: 5px;">
                            <option value="" disabled selected>Статус...</option>
                            <option value="подтверждено">Подтвердить</option>
                            <option value="выдано">Выдать</option>
                            <option value="просрочено">Просрочено</option>
                        </select><br>
                        <button class="btn btn-success" style="padding:5px; font-size:11px; margin-bottom: 5px;" onclick="returnItem(${b.id})">Возврат</button>
                        <button class="btn" style="padding:5px; font-size:11px; background:#f39c12; margin-bottom: 5px;" onclick="setDamage(${b.id})">Штраф</button>
                        ${deleteBtn}
                    </td>
                </tr>
            `;
        });
    } catch (e) {
        alert("Ошибка загрузки данных: " + e.message);
    }
}

async function updateStatus(bookingId, newStatus) {
    if (!newStatus) return;
    try {
        await apiRequest(`/admin/bookings/${bookingId}/status?new_status=${newStatus}`, "PUT");
        alert("Статус обновлен!");
        loadBookings();
    } catch (e) {
        alert("Ошибка: " + e.message);
    }
}

async function addEquipment() {
    const name = document.getElementById("eq-name").value;
    const category = document.getElementById("eq-category").value;
    const price = parseFloat(document.getElementById("eq-price").value);
    const qty = parseInt(document.getElementById("eq-qty").value);

    if (!name || !category || !price || !qty) {
        return alert("Заполните все поля!");
    }

    try {
        await apiRequest("/admin/equipment", "POST", {
            name: name,
            category: category,
            price_per_day: price,
            quantity: qty
        });
        alert("Оборудование добавлено!");
        // Очистка полей
        document.getElementById("eq-name").value = "";
        document.getElementById("eq-category").value = "";
        document.getElementById("eq-price").value = "";
        document.getElementById("eq-qty").value = "";

        loadEquipmentAdmin();
    } catch (e) {
        alert("Ошибка: " + e.message);
    }
}

async function loadUsers() {
    try {
        const users = await apiRequest("/admin/users");
        const tbody = document.getElementById("users-table-body");
        tbody.innerHTML = "";

        users.forEach(u => {
            tbody.innerHTML += `
                <tr>
                    <td>${u.id}</td>
                    <td>${u.username}</td>
                    <td><b>${u.role}</b></td>
                    <td>
                        <select onchange="updateUserRole(${u.id}, this.value)">
                            <option value="" disabled selected>Сменить роль...</option>
                            <option value="client">Клиент</option>
                            <option value="manager">Менеджер</option>
                            <option value="admin">Администратор</option>
                        </select>
                    </td>
                </tr>
            `;
        });
    } catch (e) {
        console.error("Ошибка загрузки юзеров", e);
    }
}

// Смена роли
async function updateUserRole(userId, newRole) {
    if (!newRole) return;
    try {
        await apiRequest(`/admin/users/${userId}/role?new_role=${newRole}`, "PUT");
        alert("Роль обновлена!");
        loadUsers();
    } catch (e) {
        alert("Ошибка: " + e.message);
    }
}

async function setDamage(bookingId) {
    const amount = prompt("Введите сумму штрафа за повреждение (руб):");
    if (amount && !isNaN(amount)) {
        await apiRequest(`/admin/bookings/${bookingId}/damage?damage_amount=${amount}`, "PUT");
        alert("Штраф начислен!");
        loadBookings();
    }
}

async function loadEquipmentAdmin() {
    try {
        const eqs = await apiRequest("/equipment");
        const tbody = document.getElementById("equipment-table-body");
        tbody.innerHTML = "";
        equipmentAdminCache = {}; // Очищаем кэш

        eqs.forEach(eq => {
            equipmentAdminCache[eq.id] = eq; // Сохраняем

            tbody.innerHTML += `
                <tr>
                    <td>${eq.id}</td>
                    <td>${eq.name}</td>
                    <td>${eq.category}</td>
                    <td><input type="number" value="${eq.price_per_day}" id="price-${eq.id}" style="width: 80px;"></td>
                    <td><input type="number" value="${eq.quantity}" id="qty-${eq.id}" style="width: 60px;"></td>
                    <td>${eq.condition}</td>
                    <td>
                        <!-- ПЕРЕДАЕМ ТОЛЬКО ID -->
                        <button class="btn" style="padding:5px;" onclick="updateEqData(${eq.id})">Сохранить</button>
                        <button class="btn btn-danger" style="padding:5px;" onclick="deleteEq(${eq.id})">Удалить</button>
                    </td>
                </tr>
            `;
        });
    } catch(e) { console.error(e); }
}

async function updateEqData(id) {
    const eq = equipmentAdminCache[id]; // Берем данные из кэша
    if (!eq) return;

    const newPrice = document.getElementById(`price-${id}`).value;
    const newQty = document.getElementById(`qty-${id}`).value;
    
    try {
        await apiRequest(`/admin/equipment/${id}`, "PUT", { 
            name: eq.name, 
            category: eq.category, 
            price_per_day: parseFloat(newPrice), 
            quantity: parseInt(newQty) 
        });
        alert("Данные склада обновлены!");
        loadEquipmentAdmin();
    } catch(e) { alert(e.message); }
}

async function deleteEq(id) {
    if(confirm("Вы уверены, что хотите списать это оборудование?")) {
        await apiRequest(`/admin/equipment/${id}`, "DELETE");
        loadEquipmentAdmin();
    }
}

async function returnItem(bookingId) {
    const condition = prompt("Введите состояние оборудования при возврате (например: 'Отличное', 'Поцарапано'):");
    if (condition) {
        try {
            await apiRequest(`/admin/bookings/${bookingId}/return?condition_note=${encodeURIComponent(condition)}`, "PUT");
            alert("Оборудование принято на склад!");
            loadBookings();
        } catch(e) { alert(e.message); }
    }
}

async function deleteBooking(id) {
    if (confirm("Вы уверены, что хотите удалить бронирование #" + id + "?\nЭто действие нельзя отменить, и оно повлияет на статистику выручки.")) {
        try {
            await apiRequest(`/admin/bookings/${id}`, "DELETE");
            alert("Бронирование удалено!");
            loadBookings();
            loadStats(); // Обновляем графики, т.к. выручка изменилась
        } catch (e) {
            alert("Ошибка: " + e.message);
        }
    }
}
