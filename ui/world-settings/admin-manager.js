// This file was extracted from ui/world-settings.js

export function initAdminManager(channel, worldName) {
    const hostsStorageKey = `twitch_game_hosts_${channel}_${worldName}`;
    let hosts = JSON.parse(localStorage.getItem(hostsStorageKey) || '[]');

    const adminListEl = document.getElementById('admin-list');
    const adminInputEl = document.getElementById('admin-input');
    const addAdminBtn = document.getElementById('add-admin-btn');

    function renderAdmins() {
        adminListEl.innerHTML = '';
        hosts.forEach(host => {
            const li = document.createElement('li');
            li.className = 'admin-item';
            li.textContent = host;
            const removeBtn = document.createElement('button');
            removeBtn.className = 'remove-admin-btn';
            removeBtn.innerHTML = '&times;';
            removeBtn.onclick = () => {
                hosts = hosts.filter(h => h !== host);
                localStorage.setItem(hostsStorageKey, JSON.stringify(hosts));
                renderAdmins();
            };
            li.appendChild(removeBtn);
            adminListEl.appendChild(li);
        });
    }

    addAdminBtn.addEventListener('click', () => {
        const newAdmin = adminInputEl.value.trim().toLowerCase();
        if (newAdmin && !hosts.includes(newAdmin)) {
            hosts.push(newAdmin);
            localStorage.setItem(hostsStorageKey, JSON.stringify(hosts));
            renderAdmins();
            adminInputEl.value = '';
        }
    });

    adminInputEl.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            addAdminBtn.click();
        }
    });

    renderAdmins();

    // Return the hosts array so it can be used by other parts of the settings panel
    return {
        getHosts: () => hosts
    };
}