// ===============================
// markerControl.js
// ===============================
window.markerControl = {

    // -----------------------
    // キャッシュ
    // -----------------------
    shop01Cache: {},        // pref単位
    shop01AreaCache: {},    // pref → areaId単位

    // -----------------------
    // レイヤー
    // -----------------------
    shop01Layer: null,
    shop02Layer: null,

    // -----------------------
    // 事前ロード（1回だけ）
    // -----------------------
    async preloadShop01(pref) {

        // 既にロード済みならスキップ
        if (this.shop01Cache[pref]) return;

        const url = `/MAP-/KANTO/${pref}_shop.csv`;

        const res = await fetch(url);
        const text = await res.text();

        const lines = text.trim().split('\n');

        const parsed = lines.slice(1).map(line => {
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

        // pref単位キャッシュ
        this.shop01Cache[pref] = parsed;

        // -----------------------
        // ★ area単位キャッシュ（重要）
        // -----------------------
        this.shop01AreaCache[pref] = {};

        parsed.forEach(r => {

            if (!this.shop01AreaCache[pref][r.areaId]) {
                this.shop01AreaCache[pref][r.areaId] = [];
            }

            this.shop01AreaCache[pref][r.areaId].push(r);
        });

        console.log('preload done:', pref);
    },

    // -----------------------
    // phase1（軽量点）
    // -----------------------
    showShop01(areaId) {

        if (!window.map) return;

        // レイヤー初期化
        if (!this.shop01Layer) {
            this.shop01Layer = L.layerGroup().addTo(window.map);
        }

        this.clearShop01();

        const pref = areaId.split('_')[0];

        // ★キャッシュから即取得（filterなし）
        const shops =
            (this.shop01AreaCache[pref] &&
             this.shop01AreaCache[pref][areaId]) || [];

        if (!shops.length) return;

        shops.forEach(shop => {

            if (isNaN(shop.lat) || isNaN(shop.lng)) return;

            const marker = L.marker([shop.lat, shop.lng], {
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
            });

            marker.addTo(this.shop01Layer);
        });
    },

    // -----------------------
    // phase2（ラベル表示）
    // -----------------------
    showShop02(areaId) {

        if (!window.map) return;

        if (!this.shop02Layer) {
            this.shop02Layer = L.layerGroup().addTo(window.map);
        }

        this.clearShop02();

        const pref = areaId.split('_')[0];

        const shops =
            (this.shop01AreaCache[pref] &&
             this.shop01AreaCache[pref][areaId]) || [];

        if (!shops.length) return;

        shops.forEach(shop => {

            if (isNaN(shop.lat) || isNaN(shop.lng)) return;

            const marker = L.marker([shop.lat, shop.lng], {
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
            });

            marker.addTo(this.shop02Layer);
        });
    },

    // -----------------------
    // クリア phase1
    // -----------------------
    clearShop01() {
        if (this.shop01Layer) {
            this.shop01Layer.clearLayers();
        }
    },

    // -----------------------
    // クリア phase2
    // -----------------------
    clearShop02() {
        if (this.shop02Layer) {
            this.shop02Layer.clearLayers();
        }
    }

};