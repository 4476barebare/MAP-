// ===============================
// markerControl.js
// ===============================
window.markerControl = {

    shop01Markers: [],
    shop01Cache: {},

    // -----------------------
    // areaId → pref変換
    // -----------------------
    getPrefFromAreaId(areaId) {
        if (!areaId) return null;
        return areaId.split('_')[0]; // CHIBA_SOTOBOU → CHIBA
    },

    // -----------------------
    // CSVロード（pref単位）
    // -----------------------
    async loadShop01CSV(pref) {

        if (!pref) {
            alert("pref未定義");
            return [];
        }

        // キャッシュチェック
        if (this.shop01Cache[pref]) {
            return this.shop01Cache[pref];
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

            this.shop01Cache[pref] = rows;

            // ★CSVロード確認
            alert(
                `[shop01 CSV loaded]\n` +
                `pref: ${pref}\n` +
                `total: ${rows.length}\n\n` +
                JSON.stringify(rows.slice(0, 5), null, 2)
            );

            return rows;

        } catch (e) {
            console.error('shop01 CSV load error', e);
            alert('shop01 CSV load error');
            return [];
        }
    },

    // -----------------------
    // 表示（areaIdで絞る）
    // -----------------------
    async showShop01(areaId) {

        if (!window.map) {
            alert("map未生成");
            return;
        }

        if (!areaId) {
            alert("areaId未定義");
            return;
        }

        this.clearShop01();

        const pref = this.getPrefFromAreaId(areaId);

        alert(`start: ${areaId}\npref: ${pref}`);

        const rows = await this.loadShop01CSV(pref);

        // ★ここが本体（areaIdでフィルタ）
        const shops = rows.filter(r => r.areaId === areaId);

        alert(
            `loaded\npref: ${pref}\n` +
            `total: ${rows.length}\n` +
            `filtered: ${shops.length}`
        );

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
                                <span>${shop.name}</span>
                            </div>
                        `,
                        iconSize: [30, 30],
                        iconAnchor: [15, 15]
                    })
                }
            );

            marker.addTo(window.map);
            this.shop01Markers.push(marker);
        });
    },

    // -----------------------
    // 削除
    // -----------------------
    clearShop01() {

        if (!window.map) return;

        this.shop01Markers.forEach(marker => {
            window.map.removeLayer(marker);
        });

        this.shop01Markers = [];
    }
};