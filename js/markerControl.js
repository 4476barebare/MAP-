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

        // キャッシュ
        if (this.shop01Cache[pref]) {
            const filtered = this.shop01Cache[pref].filter(r => r.areaId === areaId);

            alert(
                "cache hit\n" +
                "filter後: " + filtered.length
            );

            return filtered;
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
                    areaId: (cols[6] || '').trim()
                };
            });

            // キャッシュ保存
            this.shop01Cache[pref] = rows;

            const filtered = rows.filter(r => r.areaId === areaId);

            alert(
                "[CSV loaded]\n" +
                "pref: " + pref + "\n" +
                "total: " + rows.length + "\n" +
                "filtered: " + filtered.length
            );

            return filtered;

        } catch (e) {
            alert("CSV load error");
            return [];
        }
    },

    // -----------------------
    // 表示（shop01）
    // -----------------------
    async showShop01(areaId) {

        if (!window.map) {
            alert("map未生成");
            return;
        }

        this.clearShop01();

        alert("showShop01: " + areaId);

        const shops = await this.loadShop01CSV(areaId);

        alert("shops: " + shops.length);

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