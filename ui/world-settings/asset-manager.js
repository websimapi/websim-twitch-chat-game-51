import * as StorageManager from '../../storage-manager.js';
import { ASSET_DEFINITIONS, ASSET_RENDER_TYPES } from './assets/definitions.js';
import { createGeneratedAssetsWheel } from './assets/generated-library.js';
import { openGenerationModal } from './assets/generation-modal.js';

export function initAssetManager(channel, worldName) {
    const container = document.getElementById('assets-list-container');
    let currentAssets = {};
    let generatedAssets = [];
    let assetTypes = {}; // New: per-asset render types

    async function loadCurrentAssets() {
        const gameState = await StorageManager.loadGameState(channel, worldName);
        currentAssets = gameState.assets || {};
        generatedAssets = gameState.assetsGenerated || [];
        assetTypes = gameState.assetTypes || {};
        renderAssetsList();
    }

    async function saveAsset(key, url) {
        currentAssets[key] = url;
        await StorageManager.saveWorldAssets(channel, worldName, currentAssets);
        renderAssetsList();
    }

    async function resetAsset(key) {
        if (currentAssets[key]) {
            delete currentAssets[key];
            await StorageManager.saveWorldAssets(channel, worldName, currentAssets);
            renderAssetsList();
        }
    }

    async function saveGeneratedAssets() {
        await StorageManager.saveWorldGeneratedAssets(channel, worldName, generatedAssets);
        renderAssetsList();
    }

    async function saveAssetType(key, type) {
        assetTypes[key] = type;
        await StorageManager.saveWorldAssetTypes(channel, worldName, assetTypes);
        // No need to re-render immediately, but keep UI in sync if needed
    }

    function deleteGeneratedAsset(id) {
        generatedAssets = generatedAssets.filter(a => a.id !== id);
        saveGeneratedAssets();
    }

    function handleGeneratedAssetCreated(assetMeta) {
        generatedAssets.push(assetMeta);
        saveGeneratedAssets();
    }

    function renderAssetsList() {
        container.innerHTML = '';

        // Generated assets wheel at the top
        const wheel = createGeneratedAssetsWheel({
            generatedAssets,
            onAssign: (assetKey, assetUrl) => {
                saveAsset(assetKey, assetUrl);
            },
            onDelete: (id) => {
                deleteGeneratedAsset(id);
            }
        });
        container.appendChild(wheel);

        const list = document.createElement('div');
        list.className = 'asset-list';

        ASSET_DEFINITIONS.forEach(def => {
            const assetRow = document.createElement('div');
            assetRow.className = 'asset-row';
            assetRow.dataset.assetKey = def.key;

            const currentSrc = currentAssets[def.key] || def.defaultSrc;
            const isOverridden = !!currentAssets[def.key];

            const currentType = assetTypes[def.key] || def.defaultRenderType || 'tile';

            const typeOptionsHtml = ASSET_RENDER_TYPES.map(t => {
                const label = t === 'tile' ? 'Tile' : t === 'standing' ? 'Standing' : 'Ground';
                const selected = t === currentType ? 'selected' : '';
                return `<option value="${t}" ${selected}>${label}</option>`;
            }).join('');

            assetRow.innerHTML = `
                <div class="asset-preview">
                    <img src="${currentSrc}" alt="${def.label}">
                </div>
                <div class="asset-info">
                    <h4>${def.label}</h4>
                    <p class="status">${isOverridden ? '<span style="color: #4CAF50;">Custom Override Active</span>' : '<span style="color: #aaa;">Default</span>'}</p>
                    <div class="setting-item" style="margin-top:6px;">
                        <label style="font-size: 13px; color: #bbb; margin-right: 6px;">Asset Type:</label>
                        <select class="asset-type-select" data-key="${def.key}" style="background:#333;color:#f0f0f0;border:1px solid #555;border-radius:4px;font-size:13px;padding:3px 6px;">
                            ${typeOptionsHtml}
                        </select>
                    </div>
                </div>
                <div class="asset-actions">
                    <label class="upload-btn">
                        Upload New
                        <input type="file" class="asset-file-input" data-key="${def.key}" accept="image/*" style="display: none;">
                    </label>
                    <button class="generate-btn" data-key="${def.key}" data-label="${def.label}" data-type="${def.promptType || ''}">Generate New</button>
                    ${isOverridden ? `<button class="reset-btn" data-key="${def.key}">Reset</button>` : ''}
                </div>
            `;

            // Allow dropping generated assets from the library onto this row
            assetRow.addEventListener('dragover', (e) => {
                if (e.dataTransfer && e.dataTransfer.types.includes('text/gen-asset-id')) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                    assetRow.classList.add('asset-row-drop-target');
                }
            });

            assetRow.addEventListener('dragleave', () => {
                assetRow.classList.remove('asset-row-drop-target');
            });

            assetRow.addEventListener('drop', (e) => {
                const id = e.dataTransfer.getData('text/gen-asset-id');
                assetRow.classList.remove('asset-row-drop-target');
                if (!id) return;
                const fromLibrary = generatedAssets.find(a => a.id === id);
                if (!fromLibrary) return;
                const key = assetRow.dataset.assetKey;
                saveAsset(key, fromLibrary.url);
            });

            list.appendChild(assetRow);
        });

        container.appendChild(list);

        // Bind upload events
        container.querySelectorAll('.asset-file-input').forEach(input => {
            input.addEventListener('change', async (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const key = e.target.dataset.key;

                const label = e.target.parentElement;
                const originalText = label.firstChild.textContent;
                label.firstChild.textContent = "Uploading...";

                try {
                    const url = await window.websim.upload(file);
                    await saveAsset(key, url);
                } catch (err) {
                    console.error("Upload failed:", err);
                    alert("Failed to upload image.");
                } finally {
                    label.firstChild.textContent = originalText;
                }
            });
        });

        // Bind reset events
        container.querySelectorAll('.reset-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                resetAsset(btn.dataset.key);
            });
        });

        // Bind generate new events
        container.querySelectorAll('.generate-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const key = btn.dataset.key;
                const label = btn.dataset.label || key;
                const promptType = btn.dataset.type || '';

                openGenerationModal({
                    assetKey: key,
                    assetLabel: label,
                    assetPromptType: promptType,
                    onAccept: (url) => {
                        saveAsset(key, url);
                    },
                    onGenerated: (assetMeta) => {
                        handleGeneratedAssetCreated(assetMeta);
                    },
                    onDeleteGenerated: (id) => {
                        deleteGeneratedAsset(id);
                    }
                });
            });
        });

        // Bind asset-type dropdown events
        container.querySelectorAll('.asset-type-select').forEach(select => {
            select.addEventListener('change', (e) => {
                const key = e.target.dataset.key;
                const type = e.target.value;
                saveAssetType(key, type);
            });
        });
    }

    loadCurrentAssets();
}