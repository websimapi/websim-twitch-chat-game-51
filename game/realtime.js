import * as StorageManager from '../storage-manager.js';
import { Player } from '../player.js';
import { project } from './projection.js'; // not used currently but kept for future extension

// Initialize the host-side realtime connection and message handling
export async function initRealtimeHost(game) {
    if (game.room) return;
    try {
        const project = await window.websim.getCurrentProject();
        const creator = await window.websim.getCreator();
        const user = await window.websim.getCurrentUser();

        // Only the project creator should act as the host
        if (user.id !== creator.id) {
            console.log("Not the project creator, real-time hosting disabled.");
            return;
        }

        console.log("Project creator detected. Initializing real-time host...");
        game.room = new WebsimSocket();
        await game.room.initialize();

        // Announce that the host is online for anyone already connected
        game.room.send({ type: 'host_online', hostId: game.room.clientId });

        // Make onmessage async so we can load data if needed
        game.room.onmessage = async (event) => {
            const data = event.data;
            const fromClientId = data.clientId;

            if (data.type === 'request_link') {
                handleLinkRequest(game, fromClientId);
            } else if (data.type === 'request_host_info') {
                console.log(`Received host info request from ${fromClientId}. Responding.`);
                // A client just connected and is looking for the host.
                // Broadcast our presence again so they can see it.
                game.room.send({ type: 'host_online', hostId: game.room.clientId });
            } else if (data.type === 'auth_with_token') {
                await handleTokenAuth(game, fromClientId, data.token);
            }
        };
    } catch (error) {
        console.error("Failed to initialize real-time features:", error);
    }
}

function handleLinkRequest(game, clientId) {
    if (!game.room) return;

    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    game.pendingLinks.set(code, { clientId, expiry: Date.now() + 5 * 60 * 1000 }); // 5 min expiry

    // Broadcast the code, the specific client will pick it up
    game.room.send({ 
        type: 'pairing_code', 
        forClientId: clientId, 
        code: code 
    });

    console.log(`Generated pairing code ${code} for client ${clientId}`);

    // Clean up expired codes
    setTimeout(() => {
        if (game.pendingLinks.has(code)) {
            game.pendingLinks.delete(code);
            console.log(`Pairing code ${code} expired.`);
        }
    }, 5 * 60 * 1000);
}

async function handleTokenAuth(game, fromClientId, token) {
    if (!token) return;

    let payload = null;
    try {
        const decoded = atob(token);
        payload = JSON.parse(decoded);
    } catch (e) {
        console.warn("Failed to decode auth token:", e);
        return;
    }

    if (!payload || !payload.userId || !payload.exp) {
        console.warn("Invalid auth token payload.");
        return;
    }

    const now = Date.now();
    if (now > payload.exp) {
        console.log(`Auth token for user ${payload.userId} has expired.`);
        return;
    }

    // Ensure player exists in current game; if not, try to find in saved state
    let player = game.players.get(payload.userId);
    if (!player) {
        try {
            const gameState = await StorageManager.loadGameState(game.channel, game.worldName);
            const state = gameState.players && gameState.players[payload.userId];
            if (state && state.id && state.username) {
                player = new Player(state.id, state.username, state.color, game.settings);
                player.loadState(state);
                game.players.set(payload.userId, player);
                // Validate state against current map
                player.validateState(game.map, game);
                console.log(`Restored player ${player.username} from storage for token auth.`);
            } else {
                console.log(`No stored player data found for userId ${payload.userId}.`);
            }
        } catch (e) {
            console.error("Error restoring player from storage during token auth:", e);
        }
    }

    if (!player) {
        console.log(`Auth token references unknown playerId ${payload.userId}.`);
        return;
    }

    // Link this player to the client
    // Unlink any previous client linked to this player
    for (const [key, value] of game.linkedPlayers.entries()) {
        if (key === player.id || value === fromClientId) {
            game.linkedPlayers.delete(key);
        }
    }
    game.linkedPlayers.set(player.id, fromClientId);
    console.log(`Player ${player.username} authenticated via saved token for client ${fromClientId}.`);

    // Let the client know the link is active (no new token needed)
    game.room.send({
        type: 'link_success', 
        forClientId: fromClientId,
        username: player.username
    });

    // Send an immediate live view update
    sendLiveViewUpdate(game, player);
}

// Exported so command handling can use it for !link
export function handleLinkCommand(game, player, code) {
    if (!game.room || !code) return;
    const upperCode = code.toUpperCase();

    if (!game.pendingLinks.has(upperCode)) {
        console.log(`[${player.username}] tried to use invalid or non-existent code \"${upperCode}\".`);
        return;
    }

    const linkData = game.pendingLinks.get(upperCode);

    if (Date.now() > linkData.expiry) {
        console.log(`[${player.username}] tried to use expired code ${upperCode}.`);
        game.pendingLinks.delete(upperCode);
        return;
    }

    // Unlink any old client associated with this twitch user
    for (const [key, value] of game.linkedPlayers.entries()) {
        if (value === linkData.clientId) {
            game.linkedPlayers.delete(key);
        }
    }

    game.linkedPlayers.set(player.id, linkData.clientId);
    game.pendingLinks.delete(upperCode);

    console.log(`[${player.username}] successfully linked their account with client ${linkData.clientId}.`);

    game.room.send({
        type: 'link_success', 
        forClientId: linkData.clientId,
        username: player.username
    });

    // Generate a simple JWT-like token (base64-encoded JSON) valid for 7 days
    const tokenPayload = {
        userId: player.id,
        username: player.username,
        exp: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
    };
    try {
        const token = btoa(JSON.stringify(tokenPayload));
        game.room.send({
            type: 'jwt_token', 
            forClientId: linkData.clientId,
            token
        });
        console.log(`Issued JWT token for ${player.username} valid until ${new Date(tokenPayload.exp).toISOString()}`);
    } catch (e) {
        console.error("Failed to generate JWT token:", e);
    }

    sendLiveViewUpdate(game, player);
}

// Exported so Game.update and realtime code can push state to clients
export function sendLiveViewUpdate(game, player) {
    if (!game.room || !player || !game.linkedPlayers.has(player.id)) return;

    const clientId = game.linkedPlayers.get(player.id);
    const inventoryData = {
        logs: player.inventory.getLogCount(),
        leaves: player.inventory.getTotalLeaves(),
        flowers: player.inventory.flowers,
    };

    // Gather surrounding map data
    const VIEW_RADIUS = 16; // Increased radius so Live View shows a larger, more seamless region
    const mapChunkData = game.map.getChunk(player.pixelX, player.pixelY, VIEW_RADIUS);

    // Gather nearby players
    const nearbyPlayers = [];
    for (const otherPlayer of game.players.values()) {
        if (otherPlayer.id !== player.id && otherPlayer.isPowered()) {
            const dx = player.pixelX - otherPlayer.pixelX;
            const dy = player.pixelY - otherPlayer.pixelY;
            if (dx * dx + dy * dy < VIEW_RADIUS * VIEW_RADIUS) {
                nearbyPlayers.push(otherPlayer.getState());
            }
        }
    }

    game.room.send({
        type: 'live_view_update', 
        forClientId: clientId,
        payload: {
            inventory: inventoryData,
            playerState: player.getState(),
            mapChunk: mapChunkData,
            nearbyPlayers: nearbyPlayers,
        }
    });
}