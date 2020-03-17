const PeerNetwork = require('./index.js').default;

(async () => {
	for (let i = 0; i < 1050; ++i) {
		console.log("connecting", i + 1);
		let peerNet = new PeerNetwork();
		await peerNet.connect('http://localhost:8090');
		await new Promise((resolve) => {
			peerNet.on('uid', uid => {
				peerNet.join('test');
				resolve();
			});
		});
	}
})();
