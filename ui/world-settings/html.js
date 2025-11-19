export function getSettingsHTML(worldName, settings) {
    // Added tabs structure
    return `
        <div class="settings-tabs">
            <button class="settings-tab active" data-target="general">General</button>
            <button class="settings-tab" data-target="assets">Assets</button>
        </div>

        <div id="tab-general" class="settings-tab-content active">
            <div class="settings-grid">
                <div class="settings-column">
                    <div class="settings-section">
                        <label for="world-name-input">World Name</label>
                        <input type="text" id="world-name-input" class="world-name-input" value="${worldName}">
                    </div>
                    <div class="settings-section admin-management">
                        <label>Manage Admins</label>
                        <p class="setting-desc">Admins can use special commands in-game.</p>
                        <div class="admin-input-group">
                            <input type="text" id="admin-input" placeholder="Enter username...">
                            <button id="add-admin-btn">Add Admin</button>
                        </div>
                        <ul id="admin-list"></ul>
                    </div>
                     <div class="settings-section">
                        <label>Storage System</label>
                        <p class="setting-desc">The game now uses IndexedDB for better performance and capacity.</p>
                        <div id="storage-info">Loading...</div>
                    </div>
                    <div class="settings-section">
                        <label>World Regeneration</label>
                        <p class="setting-desc">Regenerate features on the map. Useful for updating old worlds. This cannot be undone.</p>
                        <div class="regen-buttons">
                            <button class="regen-btn" id="regenerate-trees-btn">Regenerate Trees</button>
                            <button class="regen-btn" id="regenerate-flowers-btn">Regenerate Flowers</button>
                        </div>
                    </div>
                    <div class="settings-section">
                         <label>Terrain Generator</label>
                         <p class="setting-desc">Configure and regenerate the terrain topography. <strong>Warning: This modifies the map structure!</strong></p>
                         <div class="setting-item">
                            <label for="terrain-scale">Noise Scale (Zoom)</label>
                            <input type="number" id="terrain-scale" data-path="terrain.scale" value="${settings.terrain ? settings.terrain.scale : 20}" step="1">
                         </div>
                         <div class="setting-item">
                            <label for="terrain-height">Height Multiplier</label>
                            <input type="number" id="terrain-height" data-path="terrain.height_multiplier" value="${settings.terrain ? settings.terrain.height_multiplier : 0}" step="1">
                         </div>
                         <div class="setting-item">
                            <label for="terrain-seed">Seed (Random if 0)</label>
                            <input type="number" id="terrain-seed" data-path="terrain.seed" value="${settings.terrain ? settings.terrain.seed : 12345}">
                         </div>
                         <button class="regen-btn" id="regenerate-terrain-btn" style="margin-top: 10px; border-color: #4a8cff; color: #9dc0ff;">Regenerate Terrain</button>
                    </div>
                    <div class="settings-section">
                        <label>Visuals</label>
                        <div class="setting-item">
                            <label for="render_distance">Render Distance</label>
                            <input type="number" id="render_distance" data-path="visuals.render_distance" value="${settings.visuals ? settings.visuals.render_distance : 30}" step="1" min="10" max="100">
                        </div>
                        <div class="setting-item">
                            <input type="checkbox" id="show_target_indicator" data-path="visuals.show_target_indicator" ${settings.visuals && settings.visuals.show_target_indicator ? 'checked' : ''}>
                            <label for="show_target_indicator">Show Target Tile Indicator</label>
                        </div>
                        <div class="setting-item">
                            <input type="checkbox" id="show_hitboxes" data-path="visuals.show_hitboxes" ${settings.visuals && settings.visuals.show_hitboxes ? 'checked' : ''}>
                            <label for="show_hitboxes">Show Hitbox Outlines</label>
                        </div>
                        <div class="setting-item">
                            <input type="checkbox" id="show_pathing_lines" data-path="visuals.show_pathing_lines" ${settings.visuals && settings.visuals.show_pathing_lines ? 'checked' : ''}>
                            <label for="show_pathing_lines">Show Pathing Lines</label>
                        </div>
                        <div class="setting-item">
                            <input type="checkbox" id="allow_me_command" data-path="visuals.allow_me_command" ${settings.visuals && settings.visuals.allow_me_command ? 'checked' : ''}>
                            <label for="allow_me_command">Allow !me Command</label>
                        </div>
                    </div>
                </div>
                <div class="settings-column">
                    <div class="settings-section">
                        <label>Game Rates & XP</label>
                        <div class="rate-grid">
                            <!-- Energy -->
                            <div class="rate-item"><label for="energy_duration_seconds">Energy Duration (s)</label><input type="number" id="energy_duration_seconds" data-path="energy.duration_seconds" value="${settings.energy.duration_seconds}"></div>
                            <div class="rate-item"><label for="energy_chat_cooldown_seconds">Chat Cooldown (s)</label><input type="number" id="energy_chat_cooldown_seconds" data-path="energy.chat_cooldown_seconds" value="${settings.energy.chat_cooldown_seconds}"></div>
                            <!-- Woodcutting -->
                            <div class="rate-item"><label for="tree_chop_work">Tree Chop Work (ms)</label><input type="number" id="tree_chop_work" data-path="woodcutting.tree_chop_work" value="${settings.woodcutting.tree_chop_work}"></div>
                            <div class="rate-item"><label for="finish_chop_xp">Chop Finish XP</label><input type="number" id="finish_chop_xp" data-path="woodcutting.finish_chop_xp" value="${settings.woodcutting.finish_chop_xp}"></div>
                            <div class="rate-item"><label for="harvest_logs_xp_per_log">Log Harvest WC XP</label><input type="number" id="harvest_logs_xp_per_log" data-path="woodcutting.harvest_logs_xp_per_log" value="${settings.woodcutting.harvest_logs_xp_per_log}"></div>
                            <!-- Gathering -->
                            <div class="rate-item"><label for="harvest_logs_duration_seconds">Log Harvest Time (s)</label><input type="number" id="harvest_logs_duration_seconds" data-path="gathering.harvest_logs_duration_seconds" value="${settings.gathering.harvest_logs_duration_seconds}"></div>
                            <div class="rate-item"><label for="harvest_logs_min_yield">Logs Min Yield</label><input type="number" id="harvest_logs_min_yield" data-path="gathering.harvest_logs_min_yield" value="${settings.gathering.harvest_logs_min_yield}"></div>
                            <div class="rate-item"><label for="harvest_logs_max_yield">Logs Max Yield</label><input type="number" id="harvest_logs_max_yield" data-path="gathering.harvest_logs_max_yield" value="${settings.gathering.harvest_logs_max_yield}"></div>
                            <div class="rate-item"><label for="harvest_logs_xp">Log Harvest Gath XP</label><input type="number" id="harvest_logs_xp" data-path="gathering.harvest_logs_xp" value="${settings.gathering.harvest_logs_xp}"></div>
                            <div class="rate-item"><label for="harvest_bushes_duration_seconds_base">Bush Harvest Time (s)</label><input type="number" id="harvest_bushes_duration_seconds_base" data-path="gathering.harvest_bushes_duration_seconds_base" value="${settings.gathering.harvest_bushes_duration_seconds_base}"></div>
                            <div class="rate-item"><label for="harvest_bushes_min_yield">Bush Min Yield</label><input type="number" id="harvest_bushes_min_yield" data-path="gathering.harvest_bushes_min_yield" value="${settings.gathering.harvest_bushes_min_yield}"></div>
                            <div class="rate-item"><label for="harvest_bushes_max_yield">Bush Max Yield</label><input type="number" id="harvest_bushes_max_yield" data-path="gathering.harvest_bushes_max_yield" value="${settings.gathering.harvest_bushes_max_yield}"></div>
                            <div class="rate-item"><label for="harvest_bushes_xp">Bush Harvest XP</label><input type="number" id="harvest_bushes_xp" data-path="gathering.harvest_bushes_xp" value="${settings.gathering.harvest_bushes_xp}"></div>
                            <!-- Flowers -->
                            <div class="rate-item"><label for="harvest_flowers_duration_seconds">Flower Harvest Time (s)</label><input type="number" id="harvest_flowers_duration_seconds" data-path="gathering.harvest_flowers_duration_seconds" value="${settings.gathering.harvest_flowers_duration_seconds}"></div>
                            <div class="rate-item"><label for="harvest_flowers_min_yield">Flower Min Yield</label><input type="number" id="harvest_flowers_min_yield" data-path="gathering.harvest_flowers_min_yield" value="${settings.gathering.harvest_flowers_min_yield}"></div>
                            <div class="rate-item"><label for="harvest_flowers_max_yield">Flower Max Yield</label><input type="number" id="harvest_flowers_max_yield" data-path="gathering.harvest_flowers_max_yield" value="${settings.gathering.harvest_flowers_max_yield}"></div>
                            <div class="rate-item"><label for="harvest_flowers_xp_per_flower">Flower Harvest XP</label><input type="number" id="harvest_flowers_xp_per_flower" data-path="gathering.harvest_flowers_xp_per_flower" value="${settings.gathering.harvest_flowers_xp_per_flower}"></div>
                        </div>
                    </div>
                </div>
            </div>
             <div class="settings-section delete-section">
                <label for="delete-world-input">Delete World</label>
                <p style="font-size: 14px; color: #aaa; margin: 0;">This action cannot be undone. To confirm, type the world name below.</p>
                <div class="delete-input-group">
                    <input type="text" id="delete-world-input" placeholder="Type world name to confirm...">
                    <button id="delete-world-btn" disabled>Delete</button>
                </div>
            </div>
        </div>

        <div id="tab-assets" class="settings-tab-content">
            <div class="settings-section">
                <label>Game Asset Overrides</label>
                <p class="setting-desc">Customize the look of your world by uploading your own images. These will override the default pixel art.</p>
                <div id="assets-list-container">
                    <!-- Populated by asset-manager.js -->
                    <p>Loading assets...</p>
                </div>
            </div>
        </div>

        <div class="settings-footer">
            <button id="play-btn">Play</button>
        </div>
    `;
}