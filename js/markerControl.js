// ===============================
// markerControl.js
// ===============================
window.markerControl = {

    shop01Markers: [],
    shop02Markers: [],

    shop01Cache: {},

    shop01Layer: null, // phase1
    shop02Layer: null, // phase2

    // -----------------------
    // CSVロード（pref単位）
    // -----------------------
    async loadShop01CSV(areaId) {

        const pref = areaId.split('_')[0];
        const url = `/MAP-/KANTO/${pref}_shop.csv`;

        // キャッシュ
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
        }

        return this.shop01Cache[pref].filter(r => r.areaId === areaId);
    },

    // -----------------------
    // phase1（軽量点）
    // -----------------------
    async showShop01(areaId) {

        if (!window.map) return;

        // レイヤー初期化
        if (!this.shop01Layer) {
            this.shop01Layer = L.layerGroup().addTo(window.map);
        }

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
                            <div style="
                                width:6px;
                                height:6px;
                                background:#fff;
                                border-radius:50%;
                                border:1px solid #191970;
                            "></div>
                        `,
                        iconSize: [8, 8],
                        iconAnchor: [4, 4]
                    })
                }
            );

            marker.addTo(this.shop01Layer);
            this.shop01Markers.push(marker);
        });
    },

    // -----------------------
    // phase2（拡大表示用）
    // -----------------------
    async showShop02(areaId) {

        if (!window.map) return;

        // レイヤー初期化
        if (!this.shop02Layer) {
            this.shop02Layer = L.layerGroup().addTo(window.map);
        }

        this.clearShop02();

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
                            <div style="
                                background:#191970;
                                color:#fff;
                                padding:4px 6px;
                                font-size:10px;
                                border-radius:4px;
                                white-space:nowrap;
                            ">
                                ${shop.name}
                            </div>
                        `,
                        iconSize: [80, 20],
                        iconAnchor: [40, 10]
                    })
                }
            );

            marker.addTo(this.shop02Layer);
            this.shop02Markers.push(marker);
        });
    },

    // -----------------------
    // 削除 phase1
    // -----------------------
    clearShop01() {
        if (this.shop01Layer) {
            this.shop01Layer.clearLayers();
        }
        this.shop01Markers = [];
    },

    // -----------------------
    // 削除 phase2
    // -----------------------
    clearShop02() {
        if (this.shop02Layer) {
            this.shop02Layer.clearLayers();
        }
        this.shop02Markers = [];
    }

};