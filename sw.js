// Service Worker - Depth Anything V2 Mobile PWA
// 首次访问缓存所有资源，之后完全离线可用
const CACHE_NAME = 'depth-v2-mobile-v1';
const ASSETS = [
    './',
    './mobile_standalone.html',
    './manifest.json',
    'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/ort.min.js',
    'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.18.0/dist/ort-wasm-simd-threaded.jsep.wasm',
    'https://docs.opencv.org/4.x/opencv.js',
];

// 模型文件（可能较大，单独缓存）
// 同时缓存 GitHub raw 和 Pages 地址，确保至少一个可用
const MODEL_FILES = [
    'https://raw.githubusercontent.com/AkiAki-7230/depth-mobile/master/depth_anything_v2_vits_mobile_int8.onnx',
    './depth_anything_v2_vits_mobile_int8.onnx',
    './depth_anything_v2_vits_mobile.onnx',
];

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then(async (cache) => {
            // 逐个缓存，单个失败不影响整体
            for (const url of ASSETS) {
                try {
                    await cache.add(url);
                } catch (e) {
                    console.log('SW: skip cache', url, e.message);
                }
            }
            // 模型文件较大，单独尝试
            for (const url of MODEL_FILES) {
                try {
                    await cache.add(url);
                    console.log('SW: model cached', url);
                } catch (e) {
                    console.log('SW: model not found locally, will try CDN at runtime', url);
                }
            }
            self.skipWaiting();
        })
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k))
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', (event) => {
    const req = event.request;
    // 仅处理 GET
    if (req.method !== 'GET') return;

    // ONNX 模型：cache-first（大文件，优先用缓存）
    if (req.url.endsWith('.onnx')) {
        event.respondWith(
            caches.match(req).then((cached) => {
                if (cached) return cached;
                return fetch(req).then((resp) => {
                    if (resp.ok) {
                        const clone = resp.clone();
                        caches.open(CACHE_NAME).then(c => c.put(req, clone));
                    }
                    return resp;
                }).catch(() => cached || new Response('Model not available offline', { status: 503 }));
            })
        );
        return;
    }

    // 其他资源：stale-while-revalidate（先用缓存，后台更新）
    event.respondWith(
        caches.match(req).then((cached) => {
            const fetchPromise = fetch(req).then((resp) => {
                if (resp.ok && resp.type !== 'opaque') {
                    const clone = resp.clone();
                    caches.open(CACHE_NAME).then(c => c.put(req, clone));
                }
                return resp;
            }).catch(() => cached);
            return cached || fetchPromise;
        })
    );
});
