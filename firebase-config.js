// Firebase initialization
// Replace the placeholders with your Firebase project's config
// Get these from Firebase Console > Project Settings > General > Your apps

// Using compat SDK for simplicity with plain JS
// <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js"></script>
// <script src="https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js"></script>

(function(){
    // Note: Firebase config is separate from the provided API keys.
    // The provided keys (sb_publishable_...) appear to be for a different service (like Stripe/Paddle).
    const firebaseConfig = {
        apiKey: "AIzaSyCroPjHS1_DuCQLAxOqD04Hb8oOgbEYrS8",
        authDomain: "mahmoud-227b5.firebaseapp.com",
        projectId: "mahmoud-227b5",
        appId: "1:453469562925:web:694fdc4e14a70d6d5bb0a4"
    };

    if (!window.firebase) {
        console.error('Firebase SDK not loaded. Include firebase-app-compat.js and firebase-auth-compat.js');
        return;
    }

    if (firebase.apps && firebase.apps.length === 0) {
        firebase.initializeApp(firebaseConfig);
    }
})();

