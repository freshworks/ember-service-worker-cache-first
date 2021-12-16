import {
  API_PATTERNS,
  ASSET_PATTERNS,
  VERSION,
  API_CACHE_KEY_PREFIX,
  ASSET_CACHE_KEY_PREFIX
} from 'ember-service-worker-cache-first/service-worker/config';
import cleanupCaches from 'ember-service-worker/service-worker/cleanup-caches';
import { createRegEx, urlMatchesAnyPattern } from 'ember-service-worker/service-worker/url-utils';

const API_CACHE_NAME = `${API_CACHE_KEY_PREFIX}-${VERSION}`;
const ASSET_CACHE_NAME = `${ASSET_CACHE_KEY_PREFIX}-${VERSION}`;

const API_PATTERN_REGEX = API_PATTERNS.map(createRegEx);
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
          if(response.status == 200) {
            cache.put(request, response.clone());
          }
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

const POST_MSG_TO_ALL_CLIENTS = (clients, event) => {
  
  const sourceClient = event.source;

  // 1. Post message to actual event source tab client
	console.log(`SW:: Posting message back to source client`);
	sourceClient && sourceClient.postMessage(event.data);
  
  // 2. Posting message to other tab clients, if required
  if (event.data.broadcastToAllClients && clients.length) {
		console.log(`SW:: Posting message to all other clients (${clients.length})`);
		clients.forEach((client, i) => {
      if (client.id !== sourceClient?.id) {
        client.postMessage(event.data);
      }
		});
	}
};

// Force fetch from sw-cache
const CUSTOM_FETCH = (event) => {
  console.log(`SW:: Custom sw-cache-fetch has been triggered for '${event.data.url}'`);

  let request = new Request(event.data.url, event.data.options);
  let response = caches.open(API_CACHE_NAME).then((cache) => {
    return cache.match(request).then((response) => {
      if (response) {
        return response;
      }
      // Fallback !
      return fetch(request).then((response) => {
        if (response.status == 200) {
          cache.put(request, response.clone());
        }
        return response;
      });
    });
  });
  
  response.then((res) => {
    res = res.clone();
    res.json().then((res) => {
      self.clients.matchAll().then((clients) => {
        
        // event.data.payload --> Payload received from cache, to be sent to client
        event.data.payload = res;

        POST_MSG_TO_ALL_CLIENTS(clients, event);
      });
    });
  });
};

// Force put to sw-cache
const CUSTOM_PUT = (event) => {
  console.log(`SW:: Custom sw-cache-put has been triggered for '${event.data.url}'`);

  let request = new Request(event.data.url, event.data.options);
  
  // event.data.payload --> Payload to push to cache, sent from client
  let response = new Response(event.data.payload, { status: 200, statusText: 'ok' }); // blob

  caches.open(API_CACHE_NAME).then((cache) => {
    cache.put(request, response);
    self.clients.matchAll().then((clients) => {
      POST_MSG_TO_ALL_CLIENTS(clients, event);
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
  const type = event.data.type;

  if (type === 'sync') {
    CLEAR_API_CACHE();
  } else if (type === 'custom-fetch') {
    CUSTOM_FETCH(event);
  } else if (type === 'custom-put') {
    CUSTOM_PUT(event);
  }
});
