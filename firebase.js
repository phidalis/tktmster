/*
 * Firebase bootstrap (compat SDK).
 *
 * Loaded before store.js on every page. The compat SDK exposes a global
 * `firebase`; we initialise the app once and expose the Firestore handle as
 * window.db, which store.js uses as its data layer.
 */
(function (global) {
  var config = {
    apiKey: 'AIzaSyBB0NUhdUcYDJA7ADxhx2tRTCfkC4Wu0J8',
    authDomain: 'tktmaster-6cc6b.firebaseapp.com',
    projectId: 'tktmaster-6cc6b',
    storageBucket: 'tktmaster-6cc6b.firebasestorage.app',
    messagingSenderId: '884786597629',
    appId: '1:884786597629:web:a31c949a0b34333ce3f894',
    measurementId: 'G-D7MZ2W88L8'
  };

  if (typeof firebase === 'undefined') {
    console.error('[firebase] SDK not loaded - include the compat scripts before firebase.js');
    return;
  }

  if (!firebase.apps || !firebase.apps.length) {
    firebase.initializeApp(config);
  }

  global.db = firebase.firestore();
})(window);
