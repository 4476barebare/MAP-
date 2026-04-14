// ===============================
// markerControl.js（軽量版）
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
    // 事前ロード
    // -----------------------
    async preloadShop01(pref) {

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
                icon: cols[5] || '',
                areaId: (cols[6] || '').trim()
            };
        });

        this.shop01Cache[pref] = parsed;

        // -----------------------
        // area単位キャッシュ
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
    // phase1（Canvas・軽量）
    // -----------------------
    showShop01(areaId) {

        if (!window.map) return;

        if (!this.shop01Layer) {
            this.shop01Layer = L.layerGroup().addTo(window.map);
        }

        this.clearShop01();

        const pref = areaId.split('_')[0];

        const shops =
            (this.shop01AreaCache[pref] &&
             this.shop01AreaCache[pref][areaId]) || [];

        if (!shops.length) return;

        shops.forEach(shop => {

            if (isNaN(shop.lat) || isNaN(shop.lng)) return;

            const marker = L.circleMarker([shop.lat, shop.lng], {
                radius: 3,
                color: '#191970',
                weight: 1,
                fillColor: '#fff',
                fillOpacity: 1
            });

            marker.addTo(this.shop01Layer);
        });
    },

    // -----------------------
    // icon整形（sprite用）
    // -----------------------
    getIconId(raw) {

        if (!raw) return 'default';

        return raw
            .toString()
            .trim()
            .toLowerCase()
            .replace(/\s+/g, '-')
            .replace(/[^\w-]/g, '');
    },

// ===============================
// phase2（キャッシュ完全排除版）
// ===============================
showShop02(areaKey) {
    alert(areaKey);



}
    // -----------------------
    // クリア
    // -----------------------
    clearShop01() {
        if (this.shop01Layer) {
            this.shop01Layer.clearLayers();
        }
    },

    clearShop02() {
        if (this.shop02Layer) {
            this.shop02Layer.clearLayers();
        }
    }

};