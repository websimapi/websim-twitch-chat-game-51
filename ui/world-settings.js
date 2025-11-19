import { loadSettings } from '../game-settings.js';
import * as DOM from './dom-elements.js';
import { showGame } from '../ui-manager.js';
import { regenerateMapFeature } from '../game/world-generator.js';
import { getSettingsHTML } from './world-settings/html.js';
import { initAdminManager } from './world-settings/admin-manager.js';
import { initDeleteWorld } from './world-settings/delete-world.js';
import { initRenameWorld } from './world-settings/rename-world.js';
import { initSettingsUpdater } from './world-settings/settings-updater.js';
import { initAssetManager } from './world-settings/asset-manager.js';

export function showWorldSettings(channel, worldName) {
    const settings = loadSettings(channel, worldName);

    DOM.worldSettingsContainer.classList.remove('hidden');
    DOM.worldSettingsContainer.innerHTML = getSettingsHTML(worldName, settings);

    const worldNameInputEl = document.getElementById('world-name-input');
    const playBtn = document.getElementById('play-btn');

    // --- Tab Switching Logic ---
    const tabs = DOM.worldSettingsContainer.querySelectorAll('.settings-tab');
    const contents = DOM.worldSettingsContainer.querySelectorAll('.settings-tab-content');

    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            // Deactivate all
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));

            // Activate clicked
            tab.classList.add('active');
            const targetId = `tab-${tab.dataset.target}`;
            document.getElementById(targetId).classList.add('active');
        });
    });

    // --- Module Initializations ---
    const renameManager = initRenameWorld(channel, worldName, worldNameInputEl);
    const adminManager = initAdminManager(channel, worldName);
    initSettingsUpdater(channel, worldName, settings);
    initDeleteWorld(channel, renameManager.getCurrentWorldName);
    initAssetManager(channel, worldName); // Initialize Asset Manager

    // --- Remaining Logic ---

    async function updateStorageInfo() {
        const storageInfoEl = document.getElementById('storage-info');
        if (navigator.storage && navigator.storage.estimate) {
            const estimate = await navigator.storage.estimate();
            const usage = (estimate.usage / 1024 / 1024).toFixed(2);
            const quota = (estimate.quota / 1024 / 1024).toFixed(2);
            storageInfoEl.innerHTML = `
                <p style="margin: 0; font-size: 14px;">
                    Using <strong>IndexedDB</strong>: ${usage} MB / ${quota} MB
                </p>`;
        } else {
            storageInfoEl.textContent = 'Storage estimation is not available in this browser.';
        }
    }
    updateStorageInfo();

    document.getElementById('regenerate-trees-btn').addEventListener('click', () => {
        if (confirm(`Are you sure you want to regenerate all trees for "${renameManager.getCurrentWorldName()}"?\n\nThis will remove all existing trees and spawn new ones. This action cannot be undone.`)) {
            regenerateMapFeature(channel, renameManager.getCurrentWorldName(), 'trees');
        }
    });

    document.getElementById('regenerate-flowers-btn').addEventListener('click', () => {
        if (confirm(`Are you sure you want to regenerate all flowers for "${renameManager.getCurrentWorldName()}"?\n\nThis will remove all existing flower patches and spawn new ones. This action cannot be undone.`)) {
            regenerateMapFeature(channel, renameManager.getCurrentWorldName(), 'flowers');
        }
    });

    document.getElementById('regenerate-terrain-btn').addEventListener('click', () => {
         if (confirm(`Are you sure you want to regenerate the terrain for "${renameManager.getCurrentWorldName()}"?\n\nThis will overwrite the existing height map. Trees and other objects will remain at their X/Y coordinates but their height will shift. Players may need to move if stuck.`)) {
            // Fetch latest values from inputs
            const scale = parseFloat(document.getElementById('terrain-scale').value) || 20;
            const heightMult = parseFloat(document.getElementById('terrain-height').value) || 0;
            const seed = parseFloat(document.getElementById('terrain-seed').value) || 0;
            
            regenerateMapFeature(channel, renameManager.getCurrentWorldName(), 'terrain', {
                scale,
                height_multiplier: heightMult,
                seed: seed === 0 ? Math.random() : seed
            });
        }
    });

    playBtn.addEventListener('click', async () => {
        await renameManager.handleRename(); // Save name change on play, if any
        const currentWorldName = renameManager.getCurrentWorldName();
        const hosts = adminManager.getHosts();
        const currentSettings = loadSettings(channel, currentWorldName);
        showGame(channel, currentWorldName, hosts, currentSettings);
    });
}