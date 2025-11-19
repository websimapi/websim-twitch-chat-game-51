export function showDeleteConfirmation(onConfirm) {
    const overlay = document.createElement('div');
    overlay.id = 'delete-confirm-overlay';

    const popup = document.createElement('div');
    popup.id = 'delete-confirm-popup';

    popup.innerHTML = `
        <button id="delete-confirm-close-btn">&times;</button>
        <h2>Are you sure?</h2>
        <p>This will permanently delete the world and all its data. This action cannot be undone.</p>
        <div class="delete-confirm-actions">
            <button id="delete-confirm-yes-btn">Yes (Cannot be undone)</button>
            <button id="delete-confirm-cancel-btn">Cancel</button>
        </div>
    `;

    overlay.appendChild(popup);
    document.body.appendChild(overlay);

    const closePopup = () => {
        if (document.body.contains(overlay)) {
            document.body.removeChild(overlay);
        }
        document.removeEventListener('keydown', handleEsc);
    };

    const handleEsc = (e) => {
        if (e.key === 'Escape') {
            closePopup();
        }
    };

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) {
            closePopup();
        }
    });

    document.getElementById('delete-confirm-close-btn').addEventListener('click', closePopup);
    document.getElementById('delete-confirm-cancel-btn').addEventListener('click', closePopup);
    document.getElementById('delete-confirm-yes-btn').addEventListener('click', () => {
        onConfirm();
        closePopup();
    });

    document.addEventListener('keydown', handleEsc, { once: true });
}

