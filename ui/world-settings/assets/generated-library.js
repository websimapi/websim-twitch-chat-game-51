import { ASSET_DEFINITIONS } from './definitions.js';

export function createGeneratedAssetsWheel({ generatedAssets, onAssign, onDelete }) {
    const wheel = document.createElement('div');
    wheel.className = 'generated-assets-wheel';

    const titleRow = document.createElement('div');
    titleRow.className = 'generated-assets-header';
    titleRow.innerHTML = `<span class="generated-assets-title">Generated Asset Library</span>`;

    const strip = document.createElement('div');
    strip.className = 'generated-assets-strip';

    if (!generatedAssets || generatedAssets.length === 0) {
        const emptyMsg = document.createElement('div');
        emptyMsg.className = 'generated-assets-empty';
        emptyMsg.textContent = 'No generated assets yet. Use "Generate New" to create custom art.';
        strip.appendChild(emptyMsg);
    } else {
        generatedAssets.forEach(asset => {
            const item = document.createElement('div');
            item.className = 'generated-asset-item';
            item.innerHTML = `
                <div class="generated-asset-thumb">
                    <img src="${asset.url}" alt="${asset.prompt || 'Generated asset'}">
                </div>
                <button class="generated-asset-delete-btn" data-id="${asset.id}" title="Delete from library">✕</button>
                <div class="generated-asset-assign-menu hidden"></div>
            `;

            item.draggable = true;
            item.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('text/gen-asset-id', asset.id);
                e.dataTransfer.effectAllowed = 'copyMove';
            });

            strip.appendChild(item);

            const assignMenu = item.querySelector('.generated-asset-assign-menu');

            ASSET_DEFINITIONS.forEach(def => {
                const btn = document.createElement('button');
                btn.className = 'generated-asset-assign-btn';
                btn.textContent = def.label;
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (typeof onAssign === 'function') {
                        onAssign(def.key, asset.url);
                    }
                    assignMenu.classList.add('hidden');
                });
                assignMenu.appendChild(btn);
            });

            const thumb = item.querySelector('.generated-asset-thumb');
            thumb.addEventListener('click', (e) => {
                e.stopPropagation();
                strip.querySelectorAll('.generated-asset-assign-menu').forEach(menuEl => {
                    if (menuEl !== assignMenu) {
                        menuEl.classList.add('hidden');
                    }
                });
                assignMenu.classList.toggle('hidden');
            });

            const deleteBtn = item.querySelector('.generated-asset-delete-btn');
            deleteBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (typeof onDelete === 'function') {
                    onDelete(asset.id);
                }
            });
        });
    }

    wheel.appendChild(titleRow);
    wheel.appendChild(strip);

    document.addEventListener('click', (e) => {
        if (!wheel.contains(e.target)) {
            wheel.querySelectorAll('.generated-asset-assign-menu').forEach(menuEl => {
                menuEl.classList.add('hidden');
            });
        }
    });

    return wheel;
}