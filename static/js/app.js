let selectedZoom = 19;
let config = {};
let motherTiles = [];
let currentIndex = 0;
let selections = {};
let isDrawing = false;
let tmsUrl = '';
let category = '';
let sessionStartTime = null;
let sessionInterval = null;

function selectZoom(zoom, clickedBtn) {
    selectedZoom = zoom;
    document.querySelectorAll('.zoom-btn').forEach(btn => {
        btn.classList.remove('active', 'bg-blue-600', 'text-white');
        btn.classList.add('bg-gray-200', 'text-gray-700');
    });
    clickedBtn.classList.remove('bg-gray-200', 'text-gray-700');
    clickedBtn.classList.add('active', 'bg-blue-600', 'text-white');
}

async function loadTiles() {
    try {
        tmsUrl = document.getElementById('tmsUrl').value;
        category = document.getElementById('category').value;
        const aoiText = document.getElementById('aoi').value;
        const zoom = selectedZoom;
        const miniGrid = parseInt(document.getElementById('miniGrid').value);

        const aoi = JSON.parse(aoiText);

        const response = await fetch('/api/tiles', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ aoi, zoom, mini_grid: miniGrid })
        });

        const data = await response.json();
        motherTiles = data.mother_tiles;
        config = data.config;

        selections = JSON.parse(localStorage.getItem('fairswipe_selections') || '{}');
        currentIndex = parseInt(localStorage.getItem('fairswipe_index') || '0');

        sessionStartTime = parseInt(localStorage.getItem('fairswipe_session_start') || Date.now());
        if (!localStorage.getItem('fairswipe_session_start')) {
            localStorage.setItem('fairswipe_session_start', sessionStartTime.toString());
        }

        document.getElementById('setup').classList.add('hidden');
        document.getElementById('sessionInfo').classList.remove('hidden');
        document.getElementById('viewer').classList.remove('hidden');
        document.getElementById('questionCategory').textContent = category;

        updateSessionInfo();
        if (sessionInterval) clearInterval(sessionInterval);
        sessionInterval = setInterval(updateSessionInfo, 1000);

        displayTile();
    } catch (error) {
        alert('Error loading tiles: ' + error.message);
    }
}

async function displayTile() {
    if (currentIndex >= motherTiles.length) {
        currentIndex = motherTiles.length - 1;
    }
    if (currentIndex < 0) currentIndex = 0;

    const tile = motherTiles[currentIndex];
    const canvas = document.getElementById('tileCanvas');
    const ctx = canvas.getContext('2d');

    document.getElementById('progress').textContent =
        `Tile ${currentIndex + 1} of ${motherTiles.length}`;

    updateSessionInfo();

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        drawGrid(ctx, tile, canvas.width, canvas.height);
    };
    img.onerror = () => {
        canvas.width = 256;
        canvas.height = 256;
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, 256, 256);
        ctx.fillStyle = '#333';
        ctx.font = '14px sans-serif';
        ctx.fillText('Tile not available', 80, 128);
        drawGrid(ctx, tile, 256, 256);
    };

    const url = tmsUrl.replace('{z}', tile.z).replace('{x}', tile.x).replace('{y}', tile.y);
    img.src = url;
}

function drawGrid(ctx, motherTile, width, height) {
    const childTiles = motherTile.children;
    const gridSize = Math.sqrt(childTiles.length);
    const cellWidth = width / gridSize;
    const cellHeight = height / gridSize;

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;

    childTiles.forEach((child, idx) => {
        const row = Math.floor(idx / gridSize);
        const col = idx % gridSize;
        const x = col * cellWidth;
        const y = row * cellHeight;

        ctx.strokeRect(x, y, cellWidth, cellHeight);

        const tileKey = `${child.z}-${child.x}-${child.y}`;
        if (selections[tileKey]) {
            ctx.fillStyle = 'rgba(76, 175, 80, 0.5)';
            ctx.fillRect(x, y, cellWidth, cellHeight);
        }
    });
}

function getChildTileFromCoords(x, y) {
    const tile = motherTiles[currentIndex];
    const canvas = document.getElementById('tileCanvas');
    const childTiles = tile.children;
    const gridSize = Math.sqrt(childTiles.length);
    const cellWidth = canvas.width / gridSize;
    const cellHeight = canvas.height / gridSize;

    const col = Math.floor(x / cellWidth);
    const row = Math.floor(y / cellHeight);
    const idx = row * gridSize + col;

    return childTiles[idx];
}

function toggleCell(x, y) {
    const child = getChildTileFromCoords(x, y);
    if (!child) return;

    const tileKey = `${child.z}-${child.x}-${child.y}`;
    if (selections[tileKey]) {
        delete selections[tileKey];
    } else {
        selections[tileKey] = child;
    }

    localStorage.setItem('fairswipe_selections', JSON.stringify(selections));
    displayTile();
}

const canvas = document.getElementById('tileCanvas');

canvas.addEventListener('mousedown', (e) => {
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    toggleCell(x, y);
});

canvas.addEventListener('mousemove', (e) => {
    if (!isDrawing) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const child = getChildTileFromCoords(x, y);
    if (!child) return;

    const tileKey = `${child.z}-${child.x}-${child.y}`;
    if (!selections[tileKey]) {
        selections[tileKey] = child;
        localStorage.setItem('fairswipe_selections', JSON.stringify(selections));
        displayTile();
    }
});

canvas.addEventListener('mouseup', () => { isDrawing = false; });
canvas.addEventListener('mouseleave', () => { isDrawing = false; });

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    isDrawing = true;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;
    toggleCell(x, y);
});

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    if (!isDrawing) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    const x = touch.clientX - rect.left;
    const y = touch.clientY - rect.top;

    const child = getChildTileFromCoords(x, y);
    if (!child) return;

    const tileKey = `${child.z}-${child.x}-${child.y}`;
    if (!selections[tileKey]) {
        selections[tileKey] = child;
        localStorage.setItem('fairswipe_selections', JSON.stringify(selections));
        displayTile();
    }
});

canvas.addEventListener('touchend', (e) => {
    e.preventDefault();
    isDrawing = false;
});

function updateSessionInfo() {
    const selectedCount = Object.keys(selections).length;
    document.getElementById('selectedCount').textContent = selectedCount;
    document.getElementById('totalTiles').textContent = motherTiles.length;
    document.getElementById('currentTileIndex').textContent = `${currentIndex + 1}/${motherTiles.length}`;

    if (sessionStartTime) {
        const elapsed = Math.floor((Date.now() - sessionStartTime) / 1000);
        const hours = Math.floor(elapsed / 3600);
        const minutes = Math.floor((elapsed % 3600) / 60);
        const seconds = elapsed % 60;

        let duration = '';
        if (hours > 0) duration += `${hours}h `;
        if (minutes > 0 || hours > 0) duration += `${minutes}m `;
        duration += `${seconds}s`;

        document.getElementById('sessionDuration').textContent = duration.trim();
    }
}

function nextTile() {
    if (currentIndex < motherTiles.length - 1) {
        currentIndex++;
        localStorage.setItem('fairswipe_index', currentIndex.toString());
        displayTile();
    }
}

function previousTile() {
    if (currentIndex > 0) {
        currentIndex--;
        localStorage.setItem('fairswipe_index', currentIndex.toString());
        displayTile();
    }
}

document.addEventListener('keydown', (e) => {
    if (document.getElementById('viewer').classList.contains('hidden')) return;

    if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextTile();
    } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        previousTile();
    }
});

async function finish() {
    const selectedTiles = Object.values(selections);

    const json = {
        category: category,
        selected_tiles: selectedTiles,
        total_tiles: motherTiles.length,
        config: config
    };

    const blob = new Blob([JSON.stringify(json, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fairswipe_${category}_${Date.now()}.json`;
    a.click();

    try {
        const response = await fetch('/api/geojson', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tile_ids: selectedTiles, category: category })
        });

        const geojson = await response.json();
        const geojsonBlob = new Blob([JSON.stringify(geojson, null, 2)], { type: 'application/geo+json' });
        const geojsonUrl = URL.createObjectURL(geojsonBlob);
        const geoA = document.createElement('a');
        geoA.href = geojsonUrl;
        geoA.download = `fairswipe_${category}_${Date.now()}.geojson`;
        geoA.click();
    } catch (error) {
        console.error('Error generating GeoJSON:', error);
    }

    localStorage.removeItem('fairswipe_selections');
    localStorage.removeItem('fairswipe_index');
    localStorage.removeItem('fairswipe_session_start');

    if (sessionInterval) {
        clearInterval(sessionInterval);
        sessionInterval = null;
    }

    alert('Results downloaded! You can start a new session.');
    location.reload();
}