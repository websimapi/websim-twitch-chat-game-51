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