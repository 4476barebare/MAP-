// ===============================
// markerControl.js
// ===============================
window.markerControl = {

    shop01Markers: [],
    shop01Cache: {},

    // -----------------------
    // areaId → 都道府県抽出
    // -----------------------
    getPrefFromAreaId(areaId) {
        if (!areaId) return null;
        return areaId.split('_')[0];
    },

    // -----------------------
    // CSVロード（shop01）
    // -----------------------
    async loadShop01CSV(areaId) {
        
        
         alert("start: " + areaId);

    const pref = this.getPrefFromAreaId(areaId);

    alert("pref: " + pref);

    if (!pref) return [];

        const pref = this.getPrefFromAreaId(areaId);
        if (!pref) return [];

        // キャッシュ
        if (this.shop01Cache[pref]) {
            return this.shop01Cache[pref].filter(r => r.areaId === areaId);
        }

        const url = `/MAP-/KANTO/${pref}_shop.csv`;

        try {
            const res = await fetch(url);
            const text = await res.text();

            const lines = text.trim().split('\n');

            const rows = lines.slice(1).map(line => {
                const cols = line.split(',');

                return {
                    group: cols[0] || '',
                    name: cols[1] || '',
                    lat: parseFloat(cols[2]),
                    lng: parseFloat(cols[3]),
                    notes: cols[4] || '',
                    icon: cols[5] || 'shop',
                    areaId: cols[6] || ''
                };
            });

            // キャッシュ保存
            this.shop01Cache[pref] = rows;

            // -----------------------
            // ★デバッグ表示
            // -----------------------
            alert(
                `[shop01 CSV loaded]\n` +
                `pref: ${pref}\n` +
                `count: ${rows.length}\n\n` +
                JSON.stringify(rows.slice(0, 10), null, 2) // 先頭10件だけ
            );

            return rows.filter(r => r.areaId === areaId);

        } catch (e) {
            console.error('shop01 CSV load error', e);
            alert('shop01 CSV load error');
            return [];
        }
        
        alert(
  "filter前: " + rows.length +
  "\nfilter後: " + rows.filter(r => r.areaId === areaId).length +
  "\nareaId: " + areaId
);
    },

    // -----------------------
    // 表示（shop01）
    // -----------------------
    async showShop01(areaId) {

        this.clearShop01();

        const shops = await this.loadShop01CSV(areaId);
        if (!shops.length) return;

        shops.forEach(shop => {

            if (isNaN(shop.lat) || isNaN(shop.lng)) return;

            const marker = L.marker(
                [shop.lat, shop.lng],
                {
                    icon: L.divIcon({
                        className: '',
                        html: `
                            <div class="shop01-label ${shop.icon}">
                                <svg width="16" height="16">
                                    <use href="/MAP-/icon/sprite.svg#icon-${shop.icon}"></use>
                                </svg>
                                <span>${shop.name}</span>
                            </div>
                        `,
                        iconSize: [32, 32],
                        iconAnchor: [16, 16]
                    })
                }
            );

            marker.addTo(window.map);
            this.shop01Markers.push(marker);
        });
    },

    // -----------------------
    // 削除（shop01）
    // -----------------------
    clearShop01() {

        if (!this.shop01Markers.length) return;

        this.shop01Markers.forEach(m => {
            window.map.removeLayer(m);
        });

        this.shop01Markers = [];
    }
};