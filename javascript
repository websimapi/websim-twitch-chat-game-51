    renderBase(ctx, cameraX, cameraY, drawStartX, drawEndX, drawStartY, drawEndY) {
        // ...
        ctx.translate(Math.round(-cameraX), Math.round(-cameraY));
        // ...
    }

        if (item.type === 'player') {
            item.entity.render(ctx, tileSize, camera.x, camera.y); // Need to update this call in renderer.js
        } else if (item.type === 'tree') {
            // ...

