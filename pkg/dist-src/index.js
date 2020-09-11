import EventEmitter from './event-emitter.js';
import observe from './observe.js';

class Peer extends EventEmitter {
  constructor(uid, network) {
    super();
    this.uid = uid;
    this.network = network;
    this.rooms = [];
    this.stream = new MediaStream();
    this.conn = new RTCPeerConnection({
      iceServers: [{
        url: 'stun:stun.amar.io:5349'
      }, {
        url: 'turn:turn.amar.io:5349',
        credential: 'allyourbase',
        username: 'guest'
      }]
    });

    this.conn.onicecandidate = event => event.candidate && this.network.signal('ice', {
      to: this.uid,
      candidate: event.candidate
    });

    this.conn.ondatachannel = event => this.ondatachannel(event.channel);

    this.conn.ontrack = event => this.stream.addTrack(event.track, this.stream);
  }

  createOffer() {
    this.conn.createOffer().then(offer => this.conn.setLocalDescription(offer)).then(() => this.network.signal('sdp', {
      to: this.uid,
      sdp: this.conn.localDescription
    })).catch(error => console.error('Error creating connection offer:', error));
  }

  createAnswer(sdp) {
    this.conn.createAnswer().then(answer => this.conn.setLocalDescription(answer)).then(() => this.network.signal('sdp', {
      to: this.uid,
      sdp: this.conn.localDescription
    })).catch(error => console.error('Error creating connection answer:', error));
  } // TODO: Support reliable and unreliable


  createDataChannel(label) {
    this.dataChannel = this.conn.createDataChannel(label);
    this.ondatachannel(this.dataChannel);
  }

  ondatachannel(channel) {
    this.dataChannel = channel;

    channel.onerror = error => this.emit('datachannelclose', this) || console.error('Peer', this.uid, 'DataChannel error:', error);

    channel.onopen = () => this.emit('datachannelopen', this);

    channel.onclose = () => this.emit('datachannelclose', this);

    channel.onmessage = event => this.onmessage(event.data);
  }

  onmessage(message) {
    try {
      message = JSON.parse(message);
    } catch (e) {
      console.error('Invalid data received from', this.uid, ':', message, e);
      return;
    }

    this.emit('message', message); // TODO: Validate this too

    this.emit(message.event, message.data);
  }

  send(event, data) {
    if (this.dataChannel == null || this.dataChannel.readyState !== 'open') return;
    this.dataChannel.send(JSON.stringify({
      event,
      data
    }));
  }

  disconnect() {
    if (!(this.uid in this.network.peers)) return;
    this.rooms = [];
    delete this.network.peers[this.uid];
    if (this.dataChannel != null) this.dataChannel.close();
    if (this.conn.signalingState !== 'closed') this.conn.close(); // TODO: Reconnect if wrongful DC

    this.emit('disconnect');
  }

}

export default class PeerNetwork extends EventEmitter {
  constructor() {
    super();
    this.ownUID = null;
    this.peers = {};
    this.rooms = {};
    this.stream = null;
    this.on('connection', peer => {
      peer.on('sync', ({
        roomID,
        objectPath,
        value
      }) => {
        // TODO: Error handling
        objectPath = objectPath.substr(1).split('.');
        let prop = objectPath.pop();
        let object = this.rooms[roomID].syncedData;

        while (objectPath.length) object = object[objectPath.shift()];

        object[prop] = value;
      });
    });
  }

  setStream(stream) {
    this.stream = stream;
  }

  signal(event, ...args) {
    this.sigServ.emit(event, ...args);
    return this;
  }

  join(roomID) {
    console.log('Joining room', roomID);
    this.sigServ.emit('join', {
      rid: roomID
    });

    if (!(roomID in this.rooms)) {
      let {
        object: syncedData,
        eventEmitter
      } = observe({});
      this.rooms[roomID] = {
        syncedData,
        eventEmitter
      };
      eventEmitter.on('.', (objectPath, value) => {
        // TODO: Remove temporary filthy hack to prevent broadcast storm, introduce ownership
        if (objectPath.substr(1).startsWith(this.ownUID)) //this.roomcast(roomID, 'sync', { roomID, objectPath, value });
          this.signal('roomcast', {
            rid: roomID,
            objectPath,
            value
          });
      });
    }

    return this.rooms[roomID];
  }

  leave(roomID) {
    console.log('Leaving room', roomID);
    this.sigServ.emit('leave', {
      rid: roomID
    });

    if (roomID in this.rooms) {
      this.rooms[roomID].eventEmitter.listeners = {};
      delete this.rooms[roomID];
    }
  }

  broadcast(event, data) {
    for (let uid in this.peers) this.peers[uid].send(event, data);
  }

  roomcast(roomID, event, data) {
    // TODO: Store peers in room data structure
    // TODO: Implement
    this.broadcast(event, data);
  }

  replaceTrack(index, track) {
    return Promise.all(Object.values(this.peers).map(p => p.conn.getSenders()[index].replaceTrack(track)));
  }

  replaceAudio(track) {
    return Promise.all(Object.values(this.peers).map(p => p.conn.getSenders().filter(s => s.track.kind === 'audio')[0].replaceTrack(track)));
  }

  async connect(sigServURL) {
    sigServURL = new URL(sigServURL); // TODO: Catch error

    await new Promise((resolve, reject) => {
      /*
      if (typeof window === 'undefined') {
      	global.io = require('socket.io-client');
      	let wrtc  = require('wrtc');
      	global.RTCPeerConnection     = wrtc.RTCPeerConnection;
      	global.RTCSessionDescription = wrtc.RTCSessionDescription;
      	global.RTCIceCandidate       = wrtc.RTCIceCandidate;
      	resolve();
      	return;
      }
      */
      let script = document.createElement('script');
      script.type = 'text/javascript';
      sigServURL.pathname = '/socket.io/socket.io.js';
      script.src = sigServURL.href;
      script.addEventListener('load', resolve, false);
      script.addEventListener('error', reject, false);
      document.body.appendChild(script);
    });
    this.sigServ = io(sigServURL.origin);
    this.sigServ.on('connect', () => {
      //console.log('Peer connected to signalling server');
      this.emit('sigconnect');
    });
    this.sigServ.on('disconnect', () => {
      //console.log('Peer disconnected from signalling server');
      this.emit('sigdisconnect');
    });
    this.sigServ.on('uid', uid => {
      //console.log('Peer UID is', uid);
      this.ownUID = uid;
      this.emit('uid', uid);
    });
    this.sigServ.on('join', data => {
      //console.log('A peer with UID', data.uid, 'just joined the room', data.rid);
      if (!(data.uid in this.peers)) {
        let peer = new Peer(data.uid, this);
        peer.rooms.push(data.rid);
        peer.on('datachannelopen', peer => this.emit('connection', peer));
        peer.on('datachannelclose', peer => peer.disconnect());
        peer.on('disconnect', () => this.emit('disconnection', peer));
        this.stream.getTracks().forEach(track => peer.conn.addTrack(track, this.stream));
        this.peers[data.uid] = peer;
      }

      this.sigServ.emit('hail', {
        to: data.uid,
        rid: data.rid
      });
    });
    this.sigServ.on('hail', data => {
      //console.log('A peer with UID', data.from, 'just hailed from', data.rid);
      if (data.from in this.peers) {
        this.peers[data.from].rooms.push(data.rid);
        return;
      }

      let peer = new Peer(data.from, this);
      peer.rooms.push(data.rid);
      peer.on('datachannelopen', peer => this.emit('connection', peer));
      peer.on('datachannelclose', peer => peer.disconnect());
      peer.on('disconnect', () => this.emit('disconnection', peer));
      peer.createDataChannel(this.ownUID + '_' + data.from);
      this.stream.getTracks().forEach(track => peer.conn.addTrack(track, this.stream));
      peer.createOffer();
      this.peers[data.from] = peer;
    });
    this.sigServ.on('sdp', data => {
      let sdp = data.sdp; //console.log('SDP', sdp.type, 'received from peer with UID', data.from);

      if (this.peers[data.from] == null) return;
      this.peers[data.from].conn.setRemoteDescription(new RTCSessionDescription(sdp));
      if (sdp.type === 'offer') this.peers[data.from].createAnswer(sdp);
    });
    this.sigServ.on('ice', data => {
      //console.log('ICE data received from peer with UID', data.from);
      if (this.peers[data.from] == null) return;
      this.peers[data.from].conn.addIceCandidate(new RTCIceCandidate(data.candidate));
    });
    this.sigServ.on('roomcast', data => {
      // TODO: Error handling
      let {
        rid: roomID,
        objectPath,
        value
      } = data;
      objectPath = objectPath.substr(1).split('.');
      let prop = objectPath.pop();
      let object = this.rooms[roomID.substr(1)].syncedData;

      while (objectPath.length) object = object[objectPath.shift()];

      object[prop] = value;
    });
    this.sigServ.on('leave', data => {
      if (!(data.uid in this.peers)) return;
      let peer = this.peers[data.uid];

      if (data.rid == null) {
        //console.log('A peer with UID', data.uid, 'just left all rooms');
        peer.disconnect();
        return;
      }

      if (!(data.rid in peer.rooms)) return; //console.log('A peer with UID', data.uid, 'just left the room', data.rid);

      peer.rooms.splice(peer.rooms.indexOf(data.rid), 1);
      if (peer.rooms.length > 0) return;
      peer.disconnect();
    });
    return this;
  }

}