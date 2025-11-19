import * as DOM from './ui/dom-elements.js';
import { LiveViewRenderer } from './live-view-renderer.js';

let room = null;
let hostClientId = null;
let linkRequested = false;
let isLinked = false;
let liveViewRenderer = null;
let liveViewMode = '2d'; // '2d' or '2.5d'

// New: local storage key for JWT-style token
const LOCAL_STORAGE_TOKEN_KEY = 'twitch_live_view_jwt';

const STATUS = {
    INITIAL: 'initial',
    REQUESTING: 'requesting',
    RECEIVED_CODE: 'received_code',
    LINKED: 'linked',
    HOST_NOT_FOUND: 'host_not_found',
    HOST_FOUND: 'host_found',
    ERROR: 'error'
};

function renderUI(state, data = {}) {
    const contentContainer = document.getElementById('live-view-content');
    if (!contentContainer) return;

    let content = '';
    switch (state) {
        case STATUS.INITIAL:
            content = `
                <div class="live-view-center-state">
                    <h2>View Your In-Game Inventory</h2>
                    <p>If the project creator is currently hosting a game, you can link your Twitch account to view your inventory here in real-time.</p>
                    <button id="request-link-btn" disabled>Waiting for Host...</button>
                </div>
            `;
            break;
        case STATUS.HOST_FOUND:
            content = `
                <div class="live-view-center-state">
                    <h2>Host is Online!</h2>
                    <p>The project creator is hosting a game. You can now request a link to view your inventory.</p>
                    <button id="request-link-btn">Request Link</button>
                </div>
            `;
            break;
        case STATUS.REQUESTING:
            content = `
                <div class="live-view-center-state">
                    <h2>Connecting...</h2>
                    <p>Sending a link request to the host. Please wait.</p>
                    <button id="request-link-btn" disabled>Requesting...</button>
                </div>
            `;
            break;
        case STATUS.HOST_NOT_FOUND:
            content = `
                <div class="live-view-center-state">
                    <h2>Host Not Found</h2>
                    <p>The project creator does not appear to be hosting a game right now. Please try again later.</p>
                </div>
            `;
            break;
        case STATUS.RECEIVED_CODE:
            content = `
                <div class="live-view-center-state">
                    <h2>Link Your Account</h2>
                    <p>The host has generated a pairing code for you. To finish, go to the host's Twitch channel and type the following command in chat:</p>
                    <div class="code-display">${data.code}</div>
                    <p><strong>!link ${data.code}</strong></p>
                    <p><small>This code will expire in 5 minutes.</small></p>
                </div>
            `;
            break;
        case STATUS.LINKED:
            content = `
                <div class="live-view-inventory-panel inventory-display">
                    <div class="inventory-item">
                        <span class="label" id="inventory-owner-label">${data.username || 'Your'}'s Inventory</span>
                        <span class="value"></span>
                    </div>
                    <div class="inventory-item">
                        <span class="label">🪵 Logs:</span>
                        <span class="value" id="logs-count">--</span>
                    </div>
                    <div class="inventory-item">
                        <span class="label">🌿 Leaves:</span>
                        <span class="value" id="leaves-count">--</span>
                    </div>
                    <div class="inventory-item">
                        <span class="label">🌸 Flowers:</span>
                        <span class="value" id="flowers-count">--</span>
                    </div>
                    <div class="inventory-item">
                        <span class="label">🪓 Woodcutting XP:</span>
                        <span class="value" id="woodcutting-xp">--</span>
                    </div>
                    <div class="inventory-item">
                        <span class="label">🧤 Gathering XP:</span>
                        <span class="value" id="gathering-xp">--</span>
                    </div>
                </div>
            `;
            break;
        case STATUS.ERROR:
            content = `
                <div class="live-view-center-state">
                    <h2>Error</h2>
                    <p>An error occurred while trying to connect to the host. Please refresh and try again.</p>
                    <p><small>${data.message || ''}</small></p>
                </div>
            `;
            break;
    }
    contentContainer.innerHTML = content;

    // Attach handlers for buttons after DOM update
    const requestBtn = document.getElementById('request-link-btn');
    if (requestBtn) {
        requestBtn.addEventListener('click', () => {
            requestLink();
        });
    }
}

// Helper: read a stored token and check expiry
function getStoredToken() {
    const raw = localStorage.getItem(LOCAL_STORAGE_TOKEN_KEY);
    if (!raw) return null;
    try {
        const decoded = atob(raw);
        const payload = JSON.parse(decoded);
        if (!payload.exp || Date.now() > payload.exp) {
            console.log("Stored live view token has expired, clearing.");
            localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY);
            return null;
        }
        return raw;
    } catch (e) {
        console.warn("Failed to parse stored live view token, clearing.", e);
        localStorage.removeItem(LOCAL_STORAGE_TOKEN_KEY);
        return null;
    }
}

function updateInventoryDisplay(payload) {
    const { inventory, playerState } = payload;
    const logsEl = document.getElementById('logs-count');
    const leavesEl = document.getElementById('leaves-count');
    const flowersEl = document.getElementById('flowers-count');
    if (logsEl && leavesEl && flowersEl) {
        logsEl.textContent = inventory.logs.toLocaleString();
        leavesEl.textContent = inventory.leaves.toLocaleString();
        
        let totalFlowers = 0;
        if (inventory.flowers) {
            for (const color in inventory.flowers) {
                totalFlowers += Object.values(inventory.flowers[color]).reduce((sum, amount) => sum + amount, 0);
            }
        }
        flowersEl.textContent = totalFlowers.toLocaleString();
    }

    // Update XP and inventory owner label based on the Twitch player's state
    if (playerState && playerState.skills) {
        const woodcuttingXpEl = document.getElementById('woodcutting-xp');
        const gatheringXpEl = document.getElementById('gathering-xp');

        if (woodcuttingXpEl) {
            const totalWcExp = Object.values(playerState.skills.woodcutting || {}).reduce((sum, amount) => sum + amount, 0);
            woodcuttingXpEl.textContent = totalWcExp.toLocaleString();
        }

        if (gatheringXpEl) {
            const totalGathExp = Object.values(playerState.skills.gathering || {}).reduce((sum, amount) => sum + amount, 0);
            gatheringXpEl.textContent = totalGathExp.toLocaleString();
        }

        const ownerLabelEl = document.getElementById('inventory-owner-label');
        if (ownerLabelEl && playerState.username) {
            ownerLabelEl.textContent = `${playerState.username}'s Inventory`;
        }
    }
}

async function requestLink() {
    if (linkRequested || !room || !hostClientId) return;
    linkRequested = true;
    renderUI(STATUS.REQUESTING);

    setTimeout(() => {
        if (!isLinked) {
            renderUI(STATUS.HOST_NOT_FOUND);
            linkRequested = false;
        }
    }, 5000); // 5 seconds for the host to respond with a code

    room.send({ type: 'request_link' });
}

export async function initRemoteInventory() {
    renderUI(STATUS.INITIAL);

    DOM.remoteInventoryContainer.addEventListener('click', (e) => {
        // Keep support for clicking the button if event is not caught inside overlay
        if (e.target.id === 'request-link-btn') {
            requestLink();
        }
    });

    // Check for existing token immediately
    const existingToken = getStoredToken();
    if (existingToken) {
        console.log("Found stored live view token, will attempt automatic authentication.");
    }

    try {
        room = new WebsimSocket();
        await room.initialize();
        console.log('Remote inventory socket initialized.');

        // Request host info as soon as we connect.
        console.log('Broadcasting request for host info...');
        room.send({ type: 'request_host_info' });

        const hostCheckTimeout = setTimeout(() => {
            if (!hostClientId && !isLinked) {
                console.log('No host responded in time.');
                renderUI(STATUS.HOST_NOT_FOUND);
            }
        }, 3000); // Wait 3 seconds for a host to respond.

        room.onmessage = (event) => {
            const data = event.data;

            // First, listen for the host to come online.
            if (data.type === 'host_online') {
                clearTimeout(hostCheckTimeout);
                hostClientId = data.hostId;
                console.log(`Host found with clientId: ${hostClientId}`);

                // If we have a stored token, try automatic authentication
                const token = getStoredToken();
                if (token && !isLinked) {
                    console.log("Attempting automatic live view authentication with stored token.");
                    room.send({
                        type: 'auth_with_token',
                        token
                    });
                    // While we wait, keep UI simple; host will respond with link_success/live_view_update
                } else if (!isLinked) {
                    // No token, show host-found state so user can request link
                    renderUI(STATUS.HOST_FOUND);
                }
                return; // Stop processing this event.
            }

            // After host is found, process messages meant for this client.
            if (!data.forClientId || data.forClientId !== room.clientId) return;

            if (data.type === 'pairing_code') {
                renderUI(STATUS.RECEIVED_CODE, { code: data.code });
            } else if (data.type === 'link_success') {
                if (!isLinked) {
                    isLinked = true;
                    renderUI(STATUS.LINKED, { username: data.username });
                    if (!liveViewRenderer) {
                        const canvas = document.getElementById('live-view-canvas');
                        liveViewRenderer = new LiveViewRenderer(canvas);
                        liveViewRenderer.setViewMode(liveViewMode);
                        liveViewRenderer.start();
                    }
                }
            } else if (data.type === 'jwt_token') {
                // Store the token for future automatic authentication
                if (data.token) {
                    try {
                        const decoded = atob(data.token);
                        const payload = JSON.parse(decoded);
                        if (payload && payload.exp) {
                            localStorage.setItem(LOCAL_STORAGE_TOKEN_KEY, data.token);
                            console.log(`Stored live view token valid until ${new Date(payload.exp).toISOString()}`);
                        }
                    } catch (e) {
                        console.error("Failed to store JWT token:", e);
                    }
                }
            } else if (data.type === 'live_view_update') {
                if (!isLinked) { // First inventory update also confirms a successful link
                    isLinked = true;
                    renderUI(STATUS.LINKED, { username: data.payload.playerState.username || 'Your' });
                    if (!liveViewRenderer) {
                        const canvas = document.getElementById('live-view-canvas');
                        liveViewRenderer = new LiveViewRenderer(canvas);
                        liveViewRenderer.setViewMode(liveViewMode);
                        liveViewRenderer.start();
                    }
                }
                updateInventoryDisplay(data.payload);
                if (liveViewRenderer) {
                    liveViewRenderer.updateState(data.payload);
                }
            }
        };

        // If the host is already online, we might have missed the initial broadcast.
        const creator = await window.websim.getCreator();
        if (room.peers[creator.id]) {
             // Heuristic: creator is present.
        }

    } catch (error) {
        console.error('Failed to initialize WebsimSocket for remote inventory:', error);
        renderUI(STATUS.ERROR, { message: error.message });
    }
}