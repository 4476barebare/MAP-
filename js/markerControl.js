// ===============================
// markerControl.js（シンプル統一版）
// ===============================
window.markerControl = {

    // -----------------------
    // キャッシュ（1階層に統一）
    // -----------------------
    shop01Cache: {},
    shop02Cache: {},

    // -----------------------
    // レイヤー
    // -----------------------
    shop01Layer: null,
    shop02Layer: null,

    // -----------------------
    // 事前ロード
    // -----------------------
    async preloadShop01(areaKey) {

        if (this.shop01Cache[areaKey]) return;

        const url = `/MAP-/KANTO/${areaKey}_shop.csv`;

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

        this.shop01Cache[areaKey] = parsed;

        console.log('preload done:', areaKey);
    },

    // -----------------------
    // phase1
    // -----------------------
    showShop01(areaKey) {

        if (!window.map) return;

        if (!this.shop01Layer) {
            this.shop01Layer = L.layerGroup().addTo(window.map);
        }

        this.clearShop01();

        const shops = this.shop01Cache[areaKey] || [];

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
    // icon整形
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

    // -----------------------
    // phase2
    // -----------------------
    showShop02(areaKey) {

        if (!window.map) return;

        if (!this.shop02Layer) {
            this.shop02Layer = L.layerGroup().addTo(window.map);
        }

        this.clearShop02();

        const shops = this.shop01Cache[areaKey] || [];

        if (!shops.length) return;

        shops.forEach(shop => {

            if (isNaN(shop.lat) || isNaN(shop.lng)) return;

            const iconId = this.getIconId(shop.icon);

            const html = `
                <div style="
                    width:32px;
                    height:32px;
                    background:#fff;
                    border:2px solid #191970;
                    border-radius:50%;
                    display:flex;
                    align-items:center;
                    justify-content:center;
                    box-shadow:0 2px 6px rgba(0,0,0,0.25);
                ">
                    <svg width="18" height="18" viewBox="0 0 24 24">
                        <use href="/MAP-/icon/sprite.svg#icon-${iconId}"></use>
                    </svg>
                </div>
            `;

            const marker = L.marker([shop.lat, shop.lng], {
                icon: L.divIcon({
                    className: '',
                    html,
                    iconSize: [32, 32],
                    iconAnchor: [16, 16]
                })
            });

            marker.addTo(this.shop02Layer);
        });
    },

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