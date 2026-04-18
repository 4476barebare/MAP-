// グローバル
window.prefData = null;
window.areaData = [];
window.spotData = [];
window.currentHash = '';
window.currentAreaId = null;
window.currentPhase = 'pref'; // pref / area / spot

function loadLocationCSV(csvUrl, currentFile) {
    return fetch(csvUrl)
        .then(r => r.text())
        .then(text => {
            const lines = text.trim().split('\n');
            const filePref = currentFile.replace('.html', '').toUpperCase();

            let main = null;
            const areas = [];
            const spots = [];

            const allRows = lines.slice(1).map(line => {
                const cols = line.split(',');
return {
    name: cols[0].trim(),
    zoom: parseFloat(cols[1]),
    individualId: cols[2] ? cols[2].trim() : '', // ←追加
    lat: parseFloat(cols[3]),
    lng: parseFloat(cols[4]),
    areaId: cols[5] ? cols[5].trim() : '',
    url: cols[6] ? cols[6].trim() : '',
    notes: cols[7] ? cols[7].trim() : '',
    icon: cols[8] ? cols[8].trim().toLowerCase() : null
};
            });

            allRows.forEach(row => {
                if (!row.areaId && row.name.toUpperCase() === filePref) {
                    main = row;
                }
            });

            allRows.forEach(row => {
                if (row.areaId === filePref) {
                    areas.push(row);
                }
            });

            allRows.forEach(row => {
                const icon = row.icon;
                if (!icon) return;
                if (icon === 'spot' || icon.startsWith('fish')) {
                    spots.push(row);
                }
            });

            window.prefData = main;
            window.areaData = areas;
            window.spotData = spots;

            return { main, areas, spots };
        });
}

function drawLocation(name, lat, lng, zoom, options = {}) {
    const defaultOptions = {
        center: [lat, lng],
        zoom: zoom,
        zoomControl: false,
        scrollWheelZoom: false,
        dragging: false,
        doubleClickZoom: false,
        boxZoom: false,
        keyboard: false,
        tap: false
    };

    const mapOptions = { ...defaultOptions, ...options };

    const tileUrl = 'https://cyberjapandata.gsi.go.jp/xyz/ort/{z}/{x}/{y}.jpg';

    if (window.map) {
        window.map.flyTo([lat, lng], zoom, { duration: 0.5 });

        if (window.currentTileLayer) {
            window.map.removeLayer(window.currentTileLayer);
        }

        window.currentTileLayer =
            L.tileLayer(tileUrl, { attribution: '© 国土地理院' })
                .addTo(window.map);

        mapOptions.scrollWheelZoom
            ? window.map.scrollWheelZoom.enable()
            : window.map.scrollWheelZoom.disable();

        mapOptions.dragging
            ? window.map.dragging.enable()
            : window.map.dragging.disable();

        mapOptions.doubleClickZoom
            ? window.map.doubleClickZoom.enable()
            : window.map.doubleClickZoom.disable();

        mapOptions.boxZoom
            ? window.map.boxZoom.enable()
            : window.map.boxZoom.disable();

        mapOptions.keyboard
            ? window.map.keyboard.enable()
            : window.map.keyboard.disable();

        mapOptions.touchZoom
            ? window.map.touchZoom.enable()
            : window.map.touchZoom.disable();

        if (window.map.tap) {
            mapOptions.tap
                ? window.map.tap.enable()
                : window.map.tap.disable();
        }
    } else {
        window.map = L.map('lf-map', mapOptions);
        window.map.attributionControl.setPosition('topright');

        window.currentTileLayer =
            L.tileLayer(tileUrl, { attribution: '© 国土地理院' })
                .addTo(window.map);
    }

    window.currentHash = location.hash;

if (window.currentPhase === 'pref') {
    showPrefSpots();
}
}

function selectArea(areaName) {
    if (window.spotLayer) {
        window.map.removeLayer(window.spotLayer);
        window.spotLayer = null;
    }

    if (window.markerControl && markerControl.shop01Layer) {
        window.map.removeLayer(markerControl.shop01Layer);
        markerControl.shop01Layer = null;
    }

    const area = window.areaData.find(a => a.name === areaName);
    if (!area) return;

    hidePrefSpots();

    const area_Id = (area.areaId || '').trim();
    const individualId = (area.individualId || '').trim();
const areaKey = area_Id + "_" + individualId;

    const reqId = Date.now();
    window._shop01RequestId = reqId;

    drawLocation(
        area.name,
        area.lat,
        area.lng,
        area.zoom || window.prefData.zoom
    );

    location.hash = encodeURIComponent(area.name);

    document.getElementById('map-menu').style.display = 'none';
    document.getElementById('map-back-btn').style.display = 'block';

    window.map.once('moveend', () => {
        window.map.invalidateSize(true);
        enableDragForArea();
        showSpotsForArea(areaKey);

        if (window._shop01RequestId !== reqId) return;

        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                markerControl.showShop01(areaKey);
            });
        });
    });
    window.currentPhase = 'area1';
    //showCenterMarker();
}

function selectSpot(areaName, selectName, spotLat, spotLng) {
    window.map.off('move');
    window.map.setMaxBounds(null);

    drawLocation(selectName, spotLat, spotLng, 13);

    if (window.markerControl) {
        markerControl.clearShop01();
        markerControl.clearShop02();
    }

    const areaKey = areaName;

    if (window.markerControl) {
        markerControl.showShop02(areaKey);
    }

    const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    if (window.currentTileLayer) {
        window.map.removeLayer(window.currentTileLayer);
    }

    window.currentTileLayer =
        L.tileLayer(tileUrl, {
            attribution: '© OpenStreetMap contributors',
            keepBuffer: 8,
            updateWhenIdle: true
        }).addTo(window.map);

    window.map.once('moveend', () => {
        enableDragForArea();
    });
}

function enableDragForArea() {
    if (!window.areaBounds) return;

    window.map.dragging.enable();
    window.map.setMaxBounds(window.areaBounds);
    window.map.options.maxBoundsViscosity = 1.0;
}

function goBack(hash) {
    window.map.setMaxBounds(null);
    window.map.options.maxBoundsViscosity = 0;

    window.areaBounds = null;
    window.currentAreaId = null;
    
    resetSpotLayers();

    hash = hash || window.currentHash || '';

    const parts = decodeURIComponent(hash.replace(/^#/, '')).split('/');
    const areaName = parts[0];
    const spotName = parts[1];

    if (spotName) {
        //showCenterMarker();
        return;
    } else if (areaName) {
        drawLocation(
            window.prefData.name,
            window.prefData.lat,
            window.prefData.lng,
            window.prefData.zoom
        );

        location.hash = '';
        window.currentHash = '';

        requestAnimationFrame(() => {
            showPrefSpots();
        });

        window.map.invalidateSize(true);
        window.currentPhase = 'pref';
        
        //showCenterMarker();
    }

    document.getElementById('map-menu').style.display = 'block';
    document.getElementById('map-back-btn').style.display = 'none';
}

window.selectArea = selectArea;
window.selectSpot = selectSpot;
window.goBack = goBack;
window.drawLocation = drawLocation;
window.loadLocationCSV = loadLocationCSV;

function showSpotsForArea(areaKey) {
    window.map.eachLayer(layer => {
        if (layer instanceof L.Marker) {
            window.map.removeLayer(layer);
        }
    });

    document.querySelectorAll('.spot-label').forEach(el => el.remove());

    window.spotMarkers = [];

    const spots = window.spotData.filter(s => s.areaId === areaKey);
    if (!spots.length) return;

    let minLat = 999, maxLat = -999;
    let minLng = 999, maxLng = -999;

    spots.forEach(spot => {
        const iconId = spot.icon || 'spot';
        const isFish = iconId.startsWith('fish');

        const marker = L.marker(
            [spot.lat, spot.lng],
            {
                icon: L.divIcon({
                    className: '',
                    html: `
                        <div class="spot-label ${iconId}">
                            <svg width="16" height="16">
                                <use href="/MAP-/icon/sprite.svg#icon-${iconId}"></use>
                            </svg>
                            <span>${spot.name}</span>
                        </div>
                    `,
                    iconSize: [32, 32],
                    iconAnchor: [16, 16]
                }),
                zIndexOffset: isFish
                    ? 600 + Math.floor(Math.random() * 50)
                    : Math.floor(Math.random() * 500)
            }
        );

marker.on('click', function () {

    // phase1（最初のクリック）
    if (window.currentPhase === 'area1') {
        window.currentPhase = 'area2';
        selectSpot(areaKey, spot.name, spot.lat, spot.lng);
        return;
    }

    // phase2（2回目以降）
    if (window.currentPhase === 'area2') {
        if (isFish) {
            showFishPopup(marker, spot);
        } else {
            zoomToSpot(spot);
        }
    }
});

        marker.addTo(window.map);
        window.spotMarkers.push(marker);

        if (spot.lat < minLat) minLat = spot.lat;
        if (spot.lat > maxLat) maxLat = spot.lat;
        if (spot.lng < minLng) minLng = spot.lng;
        if (spot.lng > maxLng) maxLng = spot.lng;
    });

    const latSize = maxLat - minLat;
    const lngSize = maxLng - minLng;

    const latBuffer = Math.max(latSize * 0.2, 0.05);
    const lngBuffer = Math.max(lngSize * 0.2, 0.05);

    window.areaBounds = L.latLngBounds(
        [minLat - latBuffer, minLng - lngBuffer],
        [maxLat + latBuffer, maxLng + lngBuffer]
    );
}

function createPrefSpotLayer() {
    if (window.prefSpotLayer) return;

    const layer = L.layerGroup();

    window.spotData.forEach(spot => {
        if (!spot.icon) return;

        let type = 'spot';

        if (spot.icon.startsWith('fish')) {
            const match = spot.icon.match(/fish\d+/);
            if (match) type = match[0];
        }

        const html = `<div class="pref-dot ${type}"></div>`;

        const marker = L.marker(
            [spot.lat, spot.lng],
            {
                icon: L.divIcon({
                    className: '',
                    html: html,
                    iconSize: [5, 5],
                    iconAnchor: [2.5, 2.5]
                }),
                interactive: false
            }
        );

        layer.addLayer(marker);
    });

    window.prefSpotLayer = layer;
}

function showPrefSpots() {
    createPrefSpotLayer();

    if (!window.map.hasLayer(window.prefSpotLayer)) {
        window.prefSpotLayer.addTo(window.map);
    }
}

function hidePrefSpots() {
    if (window.prefSpotLayer) {
        window.map.removeLayer(window.prefSpotLayer);
        window.prefSpotLayer = null;
    }
}

function showFishPopup(marker, spot) {
    const html = `
        <div>
            <strong>${spot.name}</strong><br>
            ${spot.notes || ''}
        </div>
    `;

    marker.bindPopup(html).openPopup();
}

function zoomToSpot(spot) {

    switchToGSIPhoto();

    const areaName = decodeURIComponent(location.hash.replace(/^#/, '')).split('/')[0];
    const individualId = spot.individualId || spot.id || '';

    if (areaName && individualId) {
        location.hash = areaName + '/' + individualId;
    }

    window.map.dragging.disable();
    window.map.scrollWheelZoom.disable();
    window.map.doubleClickZoom.disable();
    window.map.touchZoom.disable();

    drawLocation(
        spot.name,
        spot.lat,
        spot.lng,
        spot.zoom || 15,
        { animate: true }
    );
    
    resetSpotLayers();
    // ★ここが本体
    window.map.once('moveend', function () {

        const bounds = window.map.getBounds();
        const initialZoom = window.map.getZoom();

        window.map.setMaxBounds(bounds);
        window.map.options.maxBoundsViscosity = 1.0;
        window.map.setMinZoom(initialZoom);
        window.map.setMaxZoom(18);

        window.map.dragging.enable();
        window.map.scrollWheelZoom.enable();
        window.map.doubleClickZoom.enable();
        window.map.touchZoom.enable();
        
    });
}



window.gsiPhotoLayer = L.tileLayer(
    'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/{z}/{x}/{y}.jpg',
    {
        attribution: '国土地理院'
    }
);

function switchToGSIPhoto() {
    if (window.currentTileLayer) {
        window.map.removeLayer(window.currentTileLayer);
    }

    window.currentTileLayer = window.gsiPhotoLayer.addTo(window.map);
}


function resetSpotLayers() {

    if (window.markerControl) {
        markerControl.clearShop01();
        markerControl.clearShop02();
    }

    if (window.spotMarkers) {
        window.spotMarkers.forEach(m => window.map.removeLayer(m));
        window.spotMarkers = [];
    }

    if (window.prefSpotLayer && window.map.hasLayer(window.prefSpotLayer)) {
        window.map.removeLayer(window.prefSpotLayer);
    }
}