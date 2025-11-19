import * as StorageManager from '../../storage-manager.js';
import { findWorldsForChannel, populateWorldList } from '../world-list.js';

// This file was extracted from ui/world-settings.js

export function initRenameWorld(channel, initialWorldName, worldNameInputEl) {
    let currentWorldName = initialWorldName;

    const handleRename = async () => {
        const newWorldName = worldNameInputEl.value.trim();
        if (newWorldName && newWorldName !== currentWorldName) {
            if (newWorldName.toLowerCase() === 'default') {
                alert("You cannot name a world 'default'. Please choose a different name.");
                worldNameInputEl.value = currentWorldName; // Revert
                return false;
            }

            const existingWorlds = await findWorldsForChannel(channel);
            if (existingWorlds.includes(newWorldName)) {
                alert(`A world named "${newWorldName}" already exists. Please choose a different name.`);
                worldNameInputEl.value = currentWorldName; // Revert
                return false;
            }

            const success = await StorageManager.renameWorld(channel, currentWorldName, newWorldName);
            if (success) {
                console.log(`World renamed from ${currentWorldName} to ${newWorldName}`);
                currentWorldName = newWorldName;
                await populateWorldList(channel);

                // Re-select the newly named world
                setTimeout(() => {
                    const worldItems = document.querySelectorAll('.world-item h3');
                    for (const h3 of worldItems) {
                        if (h3.textContent === currentWorldName) {
                            const parent = h3.parentElement;
                            document.querySelectorAll('.world-item.selected').forEach(el => el.classList.remove('selected'));
                            parent.classList.add('selected');
                            break;
                        }
                    }
                }, 100);

                return true;
            } else {
                alert("An error occurred while renaming the world.");
                worldNameInputEl.value = currentWorldName; // Revert on failure
                return false;
            }
        }
        return false;
    };

    worldNameInputEl.addEventListener('blur', handleRename);
    worldNameInputEl.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            worldNameInputEl.blur();
        }
    });

    return {
        handleRename,
        getCurrentWorldName: () => currentWorldName
    };
}