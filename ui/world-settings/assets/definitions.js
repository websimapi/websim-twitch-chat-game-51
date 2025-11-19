// Asset definitions and prompt-building utilities for the asset manager

export const ASSET_DEFINITIONS = [
    { key: 'grass',   label: 'Grass Tile (32x32)', defaultSrc: './grass_tile.png',   type: 'tile' },
    { key: 'tree',    label: 'Tree',               defaultSrc: './tree.png',         type: 'tree' },
    { key: 'logs',    label: 'Logs',               defaultSrc: './logs.png',         type: 'prop' },
    { key: 'bushes',  label: 'Bushes',             defaultSrc: './bushes.png',       type: 'prop' },
    { key: 'flowers', label: 'Flowers',            defaultSrc: './flowers.png',      type: 'tile' },
    { key: 'dirt',    label: 'Dirt/Cliff',         defaultSrc: './dirt.png',         type: 'tile' },
];

export function buildPromptForAsset(assetType, userPrompt) {
    const trimmed = (userPrompt || '').trim();
    if (!trimmed) return '';

    const retroTag = 'Retro 16 Bit Game Asset';

    if (assetType === 'tile') {
        const tileTag = 'Repeatable Tile Texture';
        return `${retroTag}. ${tileTag}. ${trimmed}. ${tileTag}. ${retroTag}.`;
    }

    if (assetType === 'tree') {
        const treeTag = `${retroTag}, transparent background`;
        return `${treeTag}. ${trimmed}. ${treeTag}.`;
    }

    return `${retroTag}. ${trimmed}. ${retroTag}.`;
}