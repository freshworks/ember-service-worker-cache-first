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

const CLEAR_API_CACHE = (options, sourceClient) => {
  console.log('going to clear api cache for : ', options.urlsToCacheBurst);//either few URLs or all URLs(locale change)
  //if(urlsToCacheBurst){
    caches.open(API_CACHE_NAME).then((cache) => {
      options.urlsToCacheBurst.forEach((url) => {
        debugger
        cache.delete(url).then(() => {
          console.log('deleted SW cache for url : ', url);
          debugger
          let request = new Request(url, options);//options has triggeredFrom - need to remove ??
          let headers = options.headers || {};

          fetch(request, { headers }).then((_response) => {
            if(_response.status == 200) {
              cache.put(request, _response.clone());

              sourceClient.postMessage({url: url, triggeredFrom: options.triggeredFrom});
            }
            //return response;//todo : should add error handling here instead ?
          })
        });
      });
    });
  // } else {
  //   caches.delete(cacheName); //delete all URLs (locale change case)
  //   console.log('deleted SW cache for all urls');
  // }
};

const POST_MSG_TO_ALL_CLIENTS = (clients, event) => {
  
  const sourceClient = event.source;

  // 1. Post message to actual event source tab client
	console.log(`SW:: Posting message back to source client`);
  debugger
	sourceClient && sourceClient.postMessage({data: event.data, triggeredFrom: options.triggeredFrom});
  
  // 2. Posting message to other tab clients, if required
  if (event.data.broadcastToAllClients && clients.length) {//todo : preethi check this
		console.log(`SW:: Posting message to all other clients (${clients.length})`);
		clients.forEach((client, i) => {
      if (client.id !== sourceClient.id) {
        debugger
        client.postMessage({data: event.data, triggeredFrom: options.triggeredFrom});
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
      return fetch(request, { headers: event.data.options.headers || {}}).then((response) => {
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

  console.log('npm link works');
  if (type === 'sync') {
    CLEAR_API_CACHE(event.data.options, event.source);
  } else if (type === 'custom-fetch') {
    CUSTOM_FETCH(event);
  } else if (type === 'custom-put') {
    CUSTOM_PUT(event);
  }
});
