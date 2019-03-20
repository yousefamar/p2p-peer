const PeerNetwork = require('p2p-peer').PeerNetwork;

const peerNet = new PeerNetwork('sig.amar.io');

peerNet.on('connection', (peer) => {
	console.log('Peer', peer.uid, 'connected');

	peer.on('greeting', message => console.log('Peer', peer.uid + ':', message));

	peer.on('disconnect', () => console.log('Peer', peer.uid, 'disconnected'));

	console.log('Peer', peerNet.ownUid, '(us): Hi from', peerNet.ownUid + '!');

	peer.send('greeting', 'Hi from ' + peerNet.ownUid + '!');
});

peerNet.on('uid', (uid) => {
	this.join('test');
});
