const PeerNetwork = require('p2p-peer').default;

(async () => {
	const peerNet = new PeerNetwork();

	await peerNet.connect('http://localhost:8081');

	peerNet.on('connection', peer => {
		console.log('Peer', peer.uid, 'connected');

		peer.on('greeting', msg => console.log('Peer', peer.uid + ':', msg));

		peer.on('disconnect', () => console.log('Peer', peer.uid, 'disconnected'));

		console.log('Peer', peerNet.ownUID, '(us): Hi from', peerNet.ownUID + '!');

		peer.send('greeting', 'Hi from ' + peerNet.ownUID + '!');
	});

	peerNet.on('uid', uid => {
		console.log(uid);

		let room = peerNet.join('test');
		room.eventEmitter.on('.', console.log);
		setInterval(() => {
			room.syncedData[uid] = Math.random();
		}, 100);
	});
})();
