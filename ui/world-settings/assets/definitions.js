// Asset definitions and prompt-building utilities for the asset manager

// New: Logical rendering types a user can choose from
export const ASSET_RENDER_TYPES = ['tile', 'standing', 'ground'];

export const ASSET_DEFINITIONS = [
    {
        key: 'grass',
        label: 'Grass Tile (32x32)',
        defaultSrc: './grass_tile.png',
        // Used for prompt building (what kind of art to generate)
        promptType: 'tile',
        // Used for rendering behaviour selection UI
        defaultRenderType: 'tile'
    },
    {
        key: 'tree',
        label: 'Tree',
        defaultSrc: './tree.png',
        promptType: 'tree',
        defaultRenderType: 'standing'
    },
    {
        key: 'logs',
        label: 'Logs',
        defaultSrc: './logs.png',
        promptType: 'prop',
        defaultRenderType: 'ground'
    },
    {
        key: 'bushes',
        label: 'Bushes',
        defaultSrc: './bushes.png',
        promptType: 'prop',
        defaultRenderType: 'ground'
    },
    {
        key: 'flowers',
        label: 'Flowers',
        defaultSrc: './flowers.png',
        promptType: 'tile',
        defaultRenderType: 'ground'
    },
    {
        key: 'dirt',
        label: 'Dirt/Cliff',
        defaultSrc: './dirt.png',
        promptType: 'tile',
        defaultRenderType: 'tile'
    },
];

export function buildPromptForAsset(assetPromptType, userPrompt) {
    const trimmed = (userPrompt || '').trim();
    if (!trimmed) return '';

    const retroTag = 'Retro 16 Bit Game Asset';

    if (assetPromptType === 'tile') {
        const tileTag = 'Repeatable Tile Texture';
        return `${retroTag}. ${tileTag}. ${trimmed}. ${tileTag}. ${retroTag}.`;
    }

    if (assetPromptType === 'tree') {
        const treeTag = `${retroTag}, transparent background`;
        return `${treeTag}. ${trimmed}. ${treeTag}.`;
    }

    return `${retroTag}. ${trimmed}. ${retroTag}.`;
}