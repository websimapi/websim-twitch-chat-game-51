import { saveSettings } from '../../game-settings.js';
import * as DOM from '../dom-elements.js';

// This file was extracted from ui/world-settings.js

export function initSettingsUpdater(channel, worldName, settings) {
    DOM.worldSettingsContainer.querySelectorAll('select').forEach(select => {
        select.addEventListener('change', () => {
            const path = select.dataset.path.split('.');
            let current = settings;
            for (let i = 0; i < path.length - 1; i++) {
                current = current[path[i]];
            }
            current[path[path.length - 1]] = select.value;
            saveSettings(channel, worldName, settings);
        });
    });

    DOM.worldSettingsContainer.querySelectorAll('.rate-grid input[type="number"]').forEach(input => {
        input.addEventListener('change', () => {
            const path = input.dataset.path.split('.');
            let current = settings;
            for (let i = 0; i < path.length - 1; i++) {
                current = current[path[i]];
            }
            current[path[path.length - 1]] = Number(input.value);
            saveSettings(channel, worldName, settings);
        });
    });

    DOM.worldSettingsContainer.querySelectorAll('input[type="checkbox"]').forEach(input => {
        input.addEventListener('change', () => {
            const path = input.dataset.path.split('.');
            let current = settings;
            for (let i = 0; i < path.length - 1; i++) {
                if (!current[path[i]]) {
                    current[path[i]] = {};
                }
                current = current[path[i]];
            }
            current[path[path.length - 1]] = input.checked;
            saveSettings(channel, worldName, settings);
        });
    });
}