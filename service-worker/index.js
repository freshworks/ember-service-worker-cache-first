import {
  API_PATTERNS,
  ASSET_PATTERNS,
  VERSION,
  API_CACHE_KEY_PREFIX,
  ASSET_CACHE_KEY_PREFIX
} from 'ember-service-worker-cache-first/service-worker/config';
import cleanupCaches from 'ember-service-worker/service-worker/cleanup-caches';
import { createUrlRegEx, createRegEx, urlMatchesAnyPattern } from 'ember-service-worker/service-worker/url-utils';

const API_CACHE_NAME = `${API_CACHE_KEY_PREFIX}-${VERSION}`;
const ASSET_CACHE_NAME = `${ASSET_CACHE_KEY_PREFIX}-${VERSION}`;

const API_PATTERN_REGEX = API_PATTERNS.map(createUrlRegEx);
const ASSET_PATTERN_REGEX = ASSET_PATTERNS.map(createRegEx);

const FETCH_DATA = (event, cacheName) => {
  let request = event.request;
  event.respondWith(
    caches.open(cacheName).then((cache) => {
      return cache.match(request).then((response) => {
        if (response) {
          return response;
        }

        return fetch(request).then((response) => {
          cache.put(request, response.clone());
          return response;
        });
      })
    })
  );
};


const CLEAR_API_CACHE = () => {
  caches.keys().then((cacheNames) => {
    cacheNames.forEach((cacheName) => {
      if (cacheName == API_CACHE_NAME) {
        caches.delete(cacheName);
      }
    });
  });
};

self.addEventListener('fetch', (event) => {
  let request = event.request;
  if (request.method !== 'GET' || !/^https?/.test(request.url)) {
    return;
  }

  if (urlMatchesAnyPattern(request.url, ASSET_PATTERN_REGEX)) {
    FETCH_DATA(event, ASSET_CACHE_NAME);
  }

  if (urlMatchesAnyPattern(request.url, API_PATTERN_REGEX)) {
    FETCH_DATA(event, API_CACHE_NAME);
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(cleanupCaches(ASSET_CACHE_KEY_PREFIX, ASSET_CACHE_NAME));
  event.waitUntil(cleanupCaches(API_CACHE_KEY_PREFIX, API_CACHE_NAME));
});

self.addEventListener('message', (event) => {
  if(event.data.type === 'sync') {
    CLEAR_API_CACHE();
  }
});
