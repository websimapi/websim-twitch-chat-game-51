import { buildPromptForAsset } from './definitions.js';

export function openGenerationModal({
    assetKey,
    assetLabel,
    assetPromptType, // renamed from assetType for clarity
    onAccept,
    onGenerated,
    onDeleteGenerated,
}) {
    const overlay = document.createElement('div');
    overlay.className = 'asset-gen-overlay';

    const modal = document.createElement('div');
    modal.className = 'asset-gen-modal';

    modal.innerHTML = `
        <div class="asset-gen-header">
            <h3>Generate New Image for "${assetLabel}"</h3>
            <button class="asset-gen-close-btn" title="Close">✕</button>
        </div>
        <div class="asset-gen-body">
            <label class="asset-gen-label">Describe the image you want:</label>
            <textarea class="asset-gen-input" rows="3" placeholder="e.g. A darker forest tree with glowing runes..."></textarea>
            <div class="asset-gen-status"></div>
            <div class="asset-gen-preview-container">
                <div class="asset-gen-preview-placeholder">No image generated yet.</div>
                <img class="asset-gen-preview-img hidden" alt="Generated preview">
            </div>
        </div>
        <div class="asset-gen-footer">
            <button class="asset-gen-generate-btn">Generate</button>
            <div class="asset-gen-spacer"></div>
            <button class="asset-gen-accept-btn" disabled>Accept Override</button>
            <button class="asset-gen-decline-btn" disabled>Decline Override</button>
            <button class="asset-gen-delete-btn" disabled>Delete Generation</button>
        </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    const close = () => {
        if (document.body.contains(overlay)) {
            document.body.removeChild(overlay);
        }
    };

    const closeBtn = modal.querySelector('.asset-gen-close-btn');
    const generateBtn = modal.querySelector('.asset-gen-generate-btn');
    const acceptBtn = modal.querySelector('.asset-gen-accept-btn');
    const declineBtn = modal.querySelector('.asset-gen-decline-btn');
    const deleteBtn = modal.querySelector('.asset-gen-delete-btn');
    const promptInput = modal.querySelector('.asset-gen-input');
    const statusEl = modal.querySelector('.asset-gen-status');
    const previewImg = modal.querySelector('.asset-gen-preview-img');
    const previewPlaceholder = modal.querySelector('.asset-gen-preview-placeholder');

    let currentGenerated = null; // { id, url, prompt, createdAt }

    closeBtn.addEventListener('click', close);
    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            close();
        }
    });

    generateBtn.addEventListener('click', async () => {
        const rawPrompt = (promptInput.value || '').trim();
        const finalPrompt = buildPromptForAsset(assetPromptType, rawPrompt);

        if (!finalPrompt) {
            statusEl.textContent = 'Please enter a description first.';
            statusEl.className = 'asset-gen-status asset-gen-status-error';
            return;
        }

        currentGenerated = null;
        previewImg.classList.add('hidden');
        previewPlaceholder.textContent = 'Generating image...';
        statusEl.textContent = 'Generating with Flux Schnell (this may take around 10 seconds)...';
        statusEl.className = 'asset-gen-status asset-gen-status-info';
        acceptBtn.disabled = true;
        declineBtn.disabled = true;
        deleteBtn.disabled = true;
        generateBtn.disabled = true;

        try {
            const needsTransparentBg = (
                assetKey === 'tree' ||
                assetKey === 'logs' ||
                assetKey === 'bushes' ||
                assetKey === 'flowers'
            );

            const imageGenOptions = {
                prompt: finalPrompt,
                aspect_ratio: '1:1'
            };

            if (needsTransparentBg) {
                imageGenOptions.transparent = true;
            }

            const result = await window.websim.imageGen(imageGenOptions);

            const fluxUrl = result && result.url;
            if (!fluxUrl) {
                throw new Error('No URL returned from image generator.');
            }

            statusEl.textContent = 'Downloading and storing generated image...';
            const response = await fetch(fluxUrl);
            if (!response.ok) {
                throw new Error('Failed to download generated image.');
            }
            const blob = await response.blob();
            const fileName = `generated_${Date.now()}.png`;
            const file = new File([blob], fileName, { type: blob.type || 'image/png' });

            const uploadedUrl = await window.websim.upload(file);
            if (!uploadedUrl) {
                throw new Error('Upload did not return a URL.');
            }

            const url = uploadedUrl;

            currentGenerated = {
                id: `gen_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
                url,
                prompt: rawPrompt,
                createdAt: Date.now()
            };

            if (typeof onGenerated === 'function') {
                onGenerated(currentGenerated);
            }

            previewImg.src = url;
            previewImg.classList.remove('hidden');
            previewPlaceholder.textContent = '';
            statusEl.textContent = 'Image generated and stored successfully.';
            statusEl.className = 'asset-gen-status asset-gen-status-success';

            acceptBtn.disabled = false;
            declineBtn.disabled = false;
            deleteBtn.disabled = false;
        } catch (err) {
            console.error('Image generation failed:', err);
            statusEl.textContent = 'Failed to generate and store image. Please try again.';
            statusEl.className = 'asset-gen-status asset-gen-status-error';
            previewImg.classList.add('hidden');
            previewPlaceholder.textContent = 'No image generated yet.';
        } finally {
            generateBtn.disabled = false;
        }
    });

    acceptBtn.addEventListener('click', () => {
        if (!currentGenerated) return;
        if (typeof onAccept === 'function') {
            onAccept(currentGenerated.url);
        }
        close();
    });

    declineBtn.addEventListener('click', () => {
        close();
    });

    deleteBtn.addEventListener('click', () => {
        if (!currentGenerated) return;
        if (typeof onDeleteGenerated === 'function') {
            onDeleteGenerated(currentGenerated.id);
        }
        close();
    });
}

