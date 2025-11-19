import * as StorageManager from '../../storage-manager.js';
import * as DOM from '../dom-elements.js';
import { showDeleteConfirmation } from '../delete-confirmation.js';
import { populateWorldList } from '../world-list.js';

// This file was extracted from ui/world-settings.js

export function initDeleteWorld(channel, worldNameProvider) {
    const deleteWorldInput = document.getElementById('delete-world-input');
    const deleteWorldBtn = document.getElementById('delete-world-btn');

    deleteWorldInput.addEventListener('input', () => {
        if (deleteWorldInput.value === worldNameProvider()) {
            deleteWorldBtn.disabled = false;
        } else {
            deleteWorldBtn.disabled = true;
        }
    });

    deleteWorldBtn.addEventListener('click', () => {
        if (deleteWorldBtn.disabled) return;

        const worldName = worldNameProvider();

        showDeleteConfirmation(async () => {
            console.log(`Deleting world: ${worldName}`);
            await StorageManager.deleteWorld(channel, worldName);

            // Also remove settings and hosts from localStorage
            localStorage.removeItem(`twitch_game_settings_${channel}_${worldName}`);
            localStorage.removeItem(`twitch_game_hosts_${channel}_${worldName}`);

            DOM.worldSettingsContainer.classList.add('hidden');
            populateWorldList(channel);
            alert(`World "${worldName}" has been deleted.`);
        });
    });
}