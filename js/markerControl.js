// ===============================
// markerControl.js
// ===============================
window.markerControl = {

    shop01Markers: [],
    shop01Cache: {},

    // -----------------------
    // CSVロード（pref単位）
    // -----------------------
    async loadShop01CSV(areaId) 

        // ★ここはファイル取得のためだけ
        const pref = areaId.split('_')[0];

        const url = `/MAP-/KANTO/${pref}_shop.csv`;

        // キャッシュ（pref単位）
        if (!this.shop01Cache[pref]) {

            const res = await fetch(url);
            const text = await res.text();

            const lines = text.trim().split('\n');

            this.shop01Cache[pref] = lines.slice(1).map(line => {
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

            //alert(`CSV loaded: ${pref} / ${this.shop01Cache[pref].length}`);
        }

        // ★ここが最重要：渡された値そのまま使う
        const filtered = this.shop01Cache[pref].filter(r => r.areaId === areaId);

        return filtered;
    },

    // -----------------------
    // 表示
    // -----------------------
    async showShop01(areaId) {

        if (!window.map) {
            alert("map未生成");
            return;
        }

        this.clearShop01();

        //alert("表示: " + areaId);

        const shops = await this.loadShop01CSV(areaId);

        if (!shops.length) return;

        shops.forEach(shop => {

            if (isNaN(shop.lat) || isNaN(shop.lng)) return;

            const marker = L.marker(
                [shop.lat, shop.lng],
                {
                    icon: L.divIcon({
                        className: '',
                        html: `<div style=width:5px;height:5px;background:#fff;border-radius:50%;
"></div>`,
                        iconSize: [5, 5],
                        iconAnchor: [2.5, 2.5]
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

        this.shop01Markers.forEach(m => window.map.removeLayer(m));
        this.shop01Markers = [];
    }
};