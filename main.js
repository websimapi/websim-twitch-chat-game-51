import { initTwitch } from './twitch.js';
import { Game } from './game.js';
import { AudioManager } from './audio-manager.js';
import { initUIManager } from './ui-manager.js';
import { createNewWorld } from './ui/world-management.js';
import { initRemoteInventory } from './remote-inventory.js';

// Use container instead of canvas for Three.js
const gameContainer = document.getElementById('game-container');

function startGame(channel, worldName, hosts, settings) {
    console.log(`Connecting to #${channel}, world: ${worldName}...`);

    AudioManager.init();

    // Pass container, not canvas
    const game = new Game(gameContainer, channel, worldName, hosts, settings);
    
    initTwitch(
        channel, 
        (chatter) => { // onChatter for energy
            game.addOrUpdatePlayer(chatter);
        },
        (userId, command, args) => { // onCommand
            game.handlePlayerCommand(userId, command, args);
        }
    );

    game.start();
}

initUIManager(startGame);
initRemoteInventory();