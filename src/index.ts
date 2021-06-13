import EventEmitter from './event-emitter';

import { io } from 'socket.io-client';

class Peer extends EventEmitter {

	uid: string;
	rooms: string[];
	network: PeerNetwork;
	conn: RTCPeerConnection;
	dataChannel: RTCDataChannel | undefined;

	constructor(uid: string, network: PeerNetwork) {
		super();

		this.uid = uid;
		this.network = network;
		this.rooms = [];

		this.conn = new RTCPeerConnection({
			iceServers: [
				{
					urls: 'stun:stun.amar.io:5349'
				}, {
					urls: 'turn:turn.amar.io:5349',
					credential: 'allyourbase',
					username: 'guest'
				}
			]
		});
		this.conn.onicecandidate = event => event.candidate && this.network.signal('ice', {
			to: this.uid,
			candidate: event.candidate
		});
		this.conn.ondatachannel = event => this.ondatachannel(event.channel);
	}

	createOffer() {
		this.conn.createOffer()
			.then(offer => this.conn.setLocalDescription(offer))
			.then(() => {
				let payload = {
					to:  this.uid,
					sdp: this.conn.localDescription?.toJSON()
				};
				this.network.signal('sdp', payload);
			})
			.catch(error => console.error('Error creating connection offer:', error));
	}

	createAnswer() {
		this.conn.createAnswer()
			.then(answer => this.conn.setLocalDescription(answer))
			.then(() => {
				let payload = {
					to:  this.uid,
					sdp: this.conn.localDescription?.toJSON()
				};
				this.network.signal('sdp', payload);
			})
			.catch(error => console.error('Error creating connection answer:', error));
	}

	// TODO: Support reliable and unreliable
	createDataChannel(label: string) {
		this.dataChannel = this.conn.createDataChannel(label)
		this.ondatachannel(this.dataChannel);
	}

	ondatachannel(channel: RTCDataChannel) {
		this.dataChannel  = channel;
		channel.onerror   = error => {
			this.emit('datachannelclose', this);
			console.error('Peer', this.uid, 'DataChannel error:', error);
		};
		channel.onopen    = () => this.emit('datachannelopen',  this);
		channel.onclose   = () => this.emit('datachannelclose', this);
		channel.onmessage = event => this.onmessage(event.data);
	}

	onmessage(message: string) {
		let parsedMsg;
		try {
			parsedMsg = JSON.parse(message);
		} catch(e) {
			console.error('Invalid data received from', this.uid, ':', message, e);
			return;
		}
		this.emit('message', parsedMsg);
		// TODO: Validate this too
		this.emit(parsedMsg.event, parsedMsg.data);
	}

	send(event: string, data: any) {
		if (this.dataChannel == null || this.dataChannel.readyState !== 'open')
			return;

		this.dataChannel.send(JSON.stringify({ event, data }));
	}

	disconnect() {
		if (!(this.uid in this.network.peers))
			return;

		this.rooms = [];
		delete this.network.peers[this.uid];
		if (this.dataChannel != null)
			this.dataChannel.close();
		if (this.conn.signalingState !== 'closed')
			this.conn.close();
		// TODO: Reconnect if wrongful DC
		this.emit('disconnect');
	}
}

export default class PeerNetwork extends EventEmitter {

	ownUID: string;
	peers: Record<string, Peer>;
	sigServ: any;

	constructor() {
		super();

		this.ownUID = '';
		this.peers  = {};
	}

	signal(event: string, ...args: any[]) {
		this.sigServ.emit(event, ...args);
		return this;
	}

	join(roomID: string) {
		console.log('Joining room', roomID);
		this.sigServ.emit('join', { rid: roomID });
	}

	leave(roomID: string) {
		console.log('Leaving room', roomID);
		this.sigServ.emit('leave', { rid: roomID });
	}

	broadcast(event: string, data: any) {
		for (let uid in this.peers)
			this.peers[uid].send(event, data);
	}

	connect(sigServURLString: string) {
		const sigServURL = new URL(sigServURLString);

		this.sigServ = io(sigServURL.origin);

		this.sigServ.on('connect', () => {
			//console.log('Peer connected to signalling server');
			this.emit('sigconnect');
		});

		this.sigServ.on('disconnect', () => {
			//console.log('Peer disconnected from signalling server');
			this.emit('sigdisconnect');
		});

		this.sigServ.on('uid', (uid: string) => {
			//console.log('Peer UID is', uid);
			this.ownUID = uid;
			this.emit('uid', uid);
		});

		this.sigServ.on('join', (data: { uid: string, rid: string }) => {
			//console.log('A peer with UID', data.uid, 'just joined the room', data.rid);
			if (!(data.uid in this.peers)) {
				const peer = new Peer(data.uid, this);
				peer.rooms.push(data.rid);
				peer.on('datachannelopen',  (peer: Peer) => this.emit('connection', peer));
				peer.on('datachannelclose', (peer: Peer) => peer.disconnect());
				peer.on('disconnect', () => this.emit('disconnection', peer));
				this.peers[data.uid] = peer;
			}
			this.sigServ.emit('hail', { to: data.uid, rid: data.rid });
		});

		this.sigServ.on('hail', (data: { from: string, rid: string }) => {
			//console.log('A peer with UID', data.from, 'just hailed from', data.rid);
			if (data.from in this.peers) {
				this.peers[data.from].rooms.push(data.rid);
				return;
			}

			let peer = new Peer(data.from, this);
			peer.rooms.push(data.rid);
			peer.on('datachannelopen',  (peer: Peer) => this.emit('connection', peer));
			peer.on('datachannelclose', (peer: Peer) => peer.disconnect());
			peer.on('disconnect', () => this.emit('disconnection', peer));
			peer.createDataChannel(this.ownUID + '_' + data.from);
			peer.createOffer();
			this.peers[data.from] = peer;
		});

		this.sigServ.on('sdp', (data: { from: string, sdp: any }) => {
			let sdp = data.sdp;
			//console.log('SDP', sdp.type, 'received from peer with UID', data.from);

			if (this.peers[data.from] == null)
				return;

			this.peers[data.from].conn.setRemoteDescription(new RTCSessionDescription(sdp));

			if (sdp.type === 'offer')
				this.peers[data.from].createAnswer();
		});

		this.sigServ.on('ice', (data: { from: string, candidate: RTCIceCandidateInit }) => {
			//console.log('ICE data received from peer with UID', data.from);

			if (this.peers[data.from] == null)
				return;

			this.peers[data.from].conn.addIceCandidate(new RTCIceCandidate(data.candidate));
		});

		this.sigServ.on('leave', (data: { uid: string, rid: string }) => {
			if (!(data.uid in this.peers))
				return;

			let peer = this.peers[data.uid];

			if (data.rid == null) {
				//console.log('A peer with UID', data.uid, 'just left all rooms');
				peer.disconnect();
				return;
			}

			if (!(data.rid in peer.rooms))
				return;

			//console.log('A peer with UID', data.uid, 'just left the room', data.rid);

			peer.rooms.splice(peer.rooms.indexOf(data.rid), 1);

			if (peer.rooms.length > 0)
				return;

			peer.disconnect();
		});

		this.sigServ.on('connect_error', (e: Error) => {
			console.error(e);
		});

		return this;
	}
}
