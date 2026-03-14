document.addEventListener("DOMContentLoaded", function(){
    const svgObject = document.getElementById("japan-map");
    svgObject.addEventListener("load", function(){
        const svgDoc = svgObject.contentDocument;
        const regions = svgDoc.querySelectorAll(".region");
        regions.forEach(r => {
            r.addEventListener("click", () => {
                const regionId = r.id; // 例: hokkaido, kanto-chubu
                window.location.href = `prefecture.html?region=${regionId}`;
            });
        });
    });
});