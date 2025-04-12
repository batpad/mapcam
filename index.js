// Constants
const MAPTILER_KEY = 'GqScGKFa73cKg05UxaRX';
const CAMERA_POSITION = {
    lat: 18.993864,
    lng: 72.820838,
    height: 140 // meters (approximately 40 stories)
};

// Initialize application after loading data
async function initializeApp() {
    try {
        // Fetch and parse CSV data
        const csvResponse = await fetch('camera.csv');
        const csvText = await csvResponse.text();
        const frameData = csvText.trim().split('\n')
            .slice(1) // Skip header
            .map(line => {
                const [frame, timestamp, bearing, tilt, zoom] = line.split(',');
                return {
                    frame: parseInt(frame),
                    timestamp: parseFloat(timestamp),
                    bearing: parseFloat(bearing),
                    tilt: parseFloat(tilt),
                    zoom: parseFloat(zoom)
                };
            });

        // Fetch GeoJSON features
        const geojsonResponse = await fetch('features.geojson');
        const geojsonFeatures = await geojsonResponse.json();

        // Get initial frame data
        const initialFrame = frameData[0];
        
        // Calculate initial target point based on height and tilt
        const initialTargetDistance = CAMERA_POSITION.height * Math.tan((90 - initialFrame.tilt) * Math.PI / 180);
        const initialBearingRad = initialFrame.bearing * Math.PI / 180;
        
        const initialTargetPoint = {
            lng: CAMERA_POSITION.lng + (initialTargetDistance * Math.sin(initialBearingRad) / (111320 * Math.cos(CAMERA_POSITION.lat * Math.PI / 180))),
            lat: CAMERA_POSITION.lat + (initialTargetDistance * Math.cos(initialBearingRad) / 111320)
        };

        // Initialize map
        const map = new maplibregl.Map({
            container: 'map',
            style: `https://api.maptiler.com/maps/streets/style.json?key=${MAPTILER_KEY}`,
            center: [initialTargetPoint.lng, initialTargetPoint.lat],
            zoom: initialFrame.zoom,
            pitch: initialFrame.tilt,
            bearing: initialFrame.bearing,
            antialias: true
        });

        map.on('load', () => {
            // Add terrain source
            map.addSource('terrain', {
                'type': 'raster-dem',
                'url': `https://api.maptiler.com/tiles/terrain-rgb-v2/tiles.json?key=${MAPTILER_KEY}`,
                'tileSize': 512,
                'maxzoom': 14
            });
            map.setTerrain({ 'source': 'terrain', 'exaggeration': 1.5 });

            // Add 3D buildings
            map.addLayer({
                'id': '3d-buildings',
                'source': 'openmaptiles',
                'source-layer': 'building',
                'type': 'fill-extrusion',
                'minzoom': 13,
                'paint': {
                    'fill-extrusion-color': '#aaa',
                    'fill-extrusion-height': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        15,
                        0,
                        15.05,
                        ['get', 'height']
                    ],
                    'fill-extrusion-base': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        15,
                        0,
                        15.05,
                        ['get', 'min_height']
                    ],
                    'fill-extrusion-opacity': 0.8
                }
            });

            // Add GeoJSON source
            map.addSource('points', {
                'type': 'geojson',
                'data': geojsonFeatures
            });

            // Add circle layer for when video is playing
            map.addLayer({
                'id': 'points-playing',
                'type': 'circle',
                'source': 'points',
                'paint': {
                    'circle-radius': 3,
                    'circle-color': '#ffffff',
                    'circle-opacity': 0.7
                },
                'layout': {
                    'visibility': 'visible'
                }
            });

            // Add circle layer for paused state
            map.addLayer({
                'id': 'points-paused',
                'type': 'circle',
                'source': 'points',
                'paint': {
                    'circle-radius': 8,
                    'circle-color': '#ff0000',
                    'circle-opacity': 0.8,
                    'circle-stroke-width': 2,
                    'circle-stroke-color': '#ffffff'
                },
                'layout': {
                    'visibility': 'none'
                }
            });

            // Handle click events on the paused markers
            map.on('click', 'points-paused', (e) => {
                if (e.features.length > 0) {
                    const coordinates = e.features[0].geometry.coordinates.slice();
                    const name = e.features[0].properties.name;
                    
                    new maplibregl.Popup()
                        .setLngLat(coordinates)
                        .setHTML(`<h3>${name}</h3>`)
                        .addTo(map);
                }
            });

            // Change cursor to pointer when hovering over paused markers
            map.on('mouseenter', 'points-paused', () => {
                map.getCanvas().style.cursor = 'pointer';
            });
            map.on('mouseleave', 'points-paused', () => {
                map.getCanvas().style.cursor = '';
            });
        });

        // Set up video event handlers
        const video = document.getElementById('camera-feed');
        
        video.addEventListener('play', () => {
            map.setLayoutProperty('points-playing', 'visibility', 'visible');
            map.setLayoutProperty('points-paused', 'visibility', 'none');
        });

        video.addEventListener('pause', () => {
            map.setLayoutProperty('points-playing', 'visibility', 'none');
            map.setLayoutProperty('points-paused', 'visibility', 'visible');
        });

        video.addEventListener('timeupdate', () => {
            const currentTime = video.currentTime;
            const currentFrame = frameData.find(frame => 
                frame.timestamp >= currentTime
            ) || frameData[frameData.length - 1];

            // Calculate the point the camera is looking at based on bearing, tilt, and height
            const targetDistance = CAMERA_POSITION.height * Math.tan((90 - currentFrame.tilt) * Math.PI / 180);
            const bearingRad = currentFrame.bearing * Math.PI / 180;
            
            const targetPoint = {
                lng: CAMERA_POSITION.lng + (targetDistance * Math.sin(bearingRad) / (111320 * Math.cos(CAMERA_POSITION.lat * Math.PI / 180))),
                lat: CAMERA_POSITION.lat + (targetDistance * Math.cos(bearingRad) / 111320)
            };

            // Update map view
            map.easeTo({
                center: [targetPoint.lng, targetPoint.lat],
                zoom: currentFrame.zoom,
                pitch: currentFrame.tilt,
                bearing: currentFrame.bearing,
                duration: 0
            });
        });

    } catch (error) {
        console.error('Error initializing application:', error);
    }
}

// Start initialization when the page loads
document.addEventListener('DOMContentLoaded', initializeApp); 