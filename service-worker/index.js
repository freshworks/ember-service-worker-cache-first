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
					console.log('SW::FETCH_DATA:: SW has response in cache for : ', request.url);
					return response;
				}
				console.log('SW::FETCH_DATA:: sw has no cache. Triggering a fetch call for :', request.url);
				return fetch(request).then((response) => {
					if(response.status == 200) {
						let clonedResp = response.clone();
						CACHE_PUT_TO_SW(cache, request, clonedResp);
					}
					return response;
				});
			})
		})
	);
};

const CLEAR_AND_REFILL_API_CACHE = (event) => {
	let options = event.data.options;
	let urlListToCacheReset = event.data.urlListToCacheReset || [];
	let sourceClient =  event.source;
	console.log('SW::CLEAR_AND_REFILL_API_CACHE:: addon going to clear api cache for APIs : ', urlListToCacheReset);
	caches.open(API_CACHE_NAME).then((cache) => {
		urlListToCacheReset.forEach((url) => {
			cache.delete(url).then(() => {
				console.log('SW::CLEAR_AND_REFILL_API_CACHE:: deleted SW cache for url : ', url);
				let request = new Request(url, options);
				let headers = options.headers || {};

				console.log('SW::CLEAR_AND_REFILL_API_CACHE:: Fetch call trigger for url : ', url);
				fetch(request, { headers }).then((response) => {
					console.log(`SW::CLEAR_AND_REFILL_API_CACHE:: Fetch call completed for url :${url} with response :${response}`);
					if(response.status == 200) {
						CACHE_PUT_TO_SW(cache, request, response);

						sourceClient.postMessage({data: {url: url}, triggeredFrom: event.data.triggeredFrom});
					}
				})
			});
		});
	});
};

const POST_MSG_TO_ALL_CLIENTS = (clients, event) => {
	
	const sourceClient = event.source;

	// 1. Post message to actual event source tab client
	console.log(`SW::POST_MSG_TO_ALL_CLIENTS Posting message back to source client`);
	sourceClient && sourceClient.postMessage({data: event.data, triggeredFrom: event.data.triggeredFrom});
	
	// 2. Posting message to other tab clients, if required
	if (event.data.broadcastToAllClients && clients.length) {
		console.log(`SW::POST_MSG_TO_ALL_CLIENTS Posting message to all other clients (${clients.length})`);
		clients.forEach((client, i) => {
			if (client.id !== sourceClient.id) {
				client.postMessage({data: event.data, triggeredFrom: event.data.triggeredFrom});
			}
		});
	}
};

// Force fetch from sw-cache
const CUSTOM_FETCH = (event) => {
	console.log(`SW::CUSTOM_FETCH:: Custom sw-cache-fetch has been triggered for '${event.data.url}'`);

	let request = new Request(event.data.url, event.data.options);
	let response = caches.open(API_CACHE_NAME).then((cache) => {
		return cache.match(request).then((response) => {
			if (response) {
				console.log('SW::CUSTOM_FETCH:: sw has response in cache');
				return response;
			}
			// Fallback !
			return fetch(request, { headers: event.data.options.headers || {}}).then((response) => {
				if(response.status == 200) {
					let clonedResp = response.clone();
					CACHE_PUT_TO_SW(cache, request, clonedResp);
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
	console.log(`SW::CUSTOM_PUT:: Custom sw-cache-put has been triggered for '${event.data.url}'`);

	let request = new Request(event.data.url, event.data.options);
	
	let modifiedHeaders = new Headers([...event.data.options.headers, ['from-sw', true]]);

	// event.data.payload --> Payload to push to cache, sent from client
	let response = new Response(event.data.payload, { status: 200, statusText: 'ok', headers: modifiedHeaders}); // blob

	caches.open(API_CACHE_NAME).then((cache) => {
		cache.put(request, response);

		self.clients.matchAll().then((clients) => {
			POST_MSG_TO_ALL_CLIENTS(clients, event);
		});
	});
};

const CACHE_PUT_TO_SW = (cache, request, response) => {
	let modifiedHeaders = new Headers([...response.headers, ['from-sw', true]]);
	let updatedResponse = new Response(response.body, {headers: modifiedHeaders});

	console.log(`SW::cachePutToSW:: triggered cache Put with modified headers => updatedResponse :${updatedResponse}`);
	cache.put(request, updatedResponse);
}

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
		CLEAR_AND_REFILL_API_CACHE(event);
	} else if (type === 'custom-fetch') {
		CUSTOM_FETCH(event);
	} else if (type === 'custom-put') {
		CUSTOM_PUT(event);
	}
});
