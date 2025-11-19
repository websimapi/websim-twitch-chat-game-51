import { startChoppingCycle } from '../behaviors/chopping.js';
import { startGatheringCycle } from '../behaviors/gathering.js';
import { PLAYER_STATE } from '../player-state.js';
import { handleLinkCommand } from './realtime.js';

export function handlePlayerCommand(game, userId, command, args) {
    const player = game.players.get(userId);
    if (!player) return;

    if (command === 'me') {
        if (game.settings.visuals.allow_me_command) {
            game.camera.setFocus(player.id);
            console.log(`[${player.username}] used !me command to focus camera.`);
        }
        return;
    }

    // --- Host Command Check ---
    if (command === 'energy') {
        if (!game.hosts.has(player.username.toLowerCase())) {
            console.log(`[${player.username}] tried to use host command !energy but is not a host.`);
            return;
        }

        const amount = args && !isNaN(args.amount) ? Math.max(1, Math.min(12, args.amount)) : 1;
        let targetPlayer = player;

        if (args && args.targetUsername) {
            const targetUsernameLower = args.targetUsername.toLowerCase();
            const foundTarget = Array.from(game.players.values()).find(p => p.username.toLowerCase() === targetUsernameLower);
            if (foundTarget) {
                targetPlayer = foundTarget;
            } else {
                console.log(`[${player.username}] tried to give energy to non-existent player "${args.targetUsername}".`);
                return; // Target not found
            }
        }

        targetPlayer.addEnergy(amount);
        console.log(`[Host] ${player.username} gave ${amount} energy to ${targetPlayer.username}.`);
        return;
    }

    if (command === 'link') {
        const code = args.code ? args.code.trim() : null;
        handleLinkCommand(game, player, code);
        return;
    }

    if (!player.isPowered()) {
         console.log(`Player ${player.username} issued command "${command}" but has no energy.`);
         // Allow setting the command even without energy, it will start when they get some.
    }

    if (command === 'chop') {
        player.activeCommand = 'chop';
        player.followTargetId = null;
        if (player.isPowered()) {
            startChoppingCycle(player, game.map);
            console.log(`Player ${player.username} initiated !chop command.`);
        } else {
             console.log(`Player ${player.username} set !chop command. It will start when they have energy.`);
        }
    } else if (command === 'gather') {
        player.activeCommand = 'gather';
        player.followTargetId = null;
        if (player.isPowered()) {
            startGatheringCycle(player, game.map);
            console.log(`Player ${player.username} initiated !gather command.`);
        } else {
            console.log(`Player ${player.username} set !gather command. It will start when it has energy.`);
        }
    } else if (command === 'follow') {
        let targetPlayer = null;
        if (args && args.targetUsername) {
            const targetUsernameLower = args.targetUsername.toLowerCase();
            // Find any player, even offline, to store their ID. The follow logic will handle if they are powered or not.
            targetPlayer = Array.from(game.players.values()).find(p => p.username.toLowerCase() === targetUsernameLower);
             if (!targetPlayer) {
                console.log(`[${player.username}] Could not find any player (online or off) named "${args.targetUsername}".`);
                return;
            }
        } else {
            // Find nearest powered player
            let minDistance = Infinity;
            for (const otherPlayer of game.players.values()) {
                if (otherPlayer.id === player.id || !otherPlayer.isPowered()) continue;
                const dx = otherPlayer.pixelX - player.pixelX;
                const dy = otherPlayer.pixelY - player.pixelY;
                const distance = dx * dx + dy * dy;
                if (distance < minDistance) {
                    minDistance = distance;
                    targetPlayer = otherPlayer;
                }
            }
        }

        if (targetPlayer) {
            player.activeCommand = 'follow';
            player.followTargetId = targetPlayer.id;
            if (player.isPowered()) {
                player.state = PLAYER_STATE.FOLLOWING;
            }
            console.log(`[${player.username}] will now follow ${targetPlayer.username}.`);
        } else {
            console.log(`[${player.username}] Could not find anyone nearby to follow.`);
            if (player.isPowered()) {
                player.state = PLAYER_STATE.IDLE;
            }
        }
    }
}