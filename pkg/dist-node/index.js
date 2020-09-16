'use strict';

Object.defineProperty(exports, '__esModule', { value: true });

function asyncGeneratorStep(gen, resolve, reject, _next, _throw, key, arg) {
  try {
    var info = gen[key](arg);
    var value = info.value;
  } catch (error) {
    reject(error);
    return;
  }

  if (info.done) {
    resolve(value);
  } else {
    Promise.resolve(value).then(_next, _throw);
  }
}

function _asyncToGenerator(fn) {
  return function () {
    var self = this,
        args = arguments;
    return new Promise(function (resolve, reject) {
      var gen = fn.apply(self, args);

      function _next(value) {
        asyncGeneratorStep(gen, resolve, reject, _next, _throw, "next", value);
      }

      function _throw(err) {
        asyncGeneratorStep(gen, resolve, reject, _next, _throw, "throw", err);
      }

      _next(undefined);
    });
  };
}

// TODO: Use three.js' built-in implementation instead?
class EventEmitter {
  constructor() {
    this.listeners = {};
  }

  on(event, callback) {
    this.listeners[event] = this.listeners[event] || [];
    this.listeners[event].push(callback);
  }

  removeListener(event, callback) {
    this.listeners[event] = this.listeners[event] || [];
    let id = this.listeners[event].indexOf(callback);
    if (id < 0) return;
    this.listeners[event].splice(id, 1);
  }

  emit(event, ...data) {
    this.listeners[event] = this.listeners[event] || []; // TODO: Wrap in try-catch

    var _iteratorNormalCompletion = true;
    var _didIteratorError = false;
    var _iteratorError = undefined;

    try {
      for (var _iterator = this.listeners[event][Symbol.iterator](), _step; !(_iteratorNormalCompletion = (_step = _iterator.next()).done); _iteratorNormalCompletion = true) {
        let callback = _step.value;
        callback(...data);
      }
    } catch (err) {
      _didIteratorError = true;
      _iteratorError = err;
    } finally {
      try {
        if (!_iteratorNormalCompletion && _iterator.return != null) {
          _iterator.return();
        }
      } finally {
        if (_didIteratorError) {
          throw _iteratorError;
        }
      }
    }
  }

}

function createHandler(objectPath, eventEmitter) {
  return {
    set: (target, prop, value) => {
      eventEmitter.emit(objectPath + '.' + prop, value); // Emit on root too to have a catch-all

      eventEmitter.emit('.', objectPath + '.' + prop, value);
      if (typeof value === 'object' && !!value) value = observe(value, objectPath + '.' + prop, eventEmitter).object;
      target[prop] = value;
      return true;
    }
  };
}

function observe(object, objectPath = '', eventEmitter = new EventEmitter()) {
  for (let key in object) {
    let value = object[key];
    if (typeof value !== 'object' || !value) continue;
    object[key] = observe(object[key], objectPath + '.' + key, eventEmitter).object;
  }

  return {
    object: new Proxy(object, createHandler(objectPath, eventEmitter)),
    eventEmitter: eventEmitter
  };
}

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
    this.conn.createOffer().then(offer => this.conn.setLocalDescription(offer)).then(() => {
      let payload = {
        to: this.uid,
        sdp: this.conn.localDescription.toJSON()
      };
      const text = this.conn.localDescription.sdp.split('\r\n');
      let opusLine = text.filter(l => l.includes('opus'));

      if (opusLine.length) {
        opusLine = opusLine[0];
        const id = opusLine.split(':')[1].split(' ')[0];
        console.log('opus line:', opusLine, id);
        const fmtpLineID = text.findIndex(l => l.startsWith('a=fmtp:' + id));

        if (fmtpLineID >= 0) {
          console.log('old fmtp line', text[fmtpLineID], fmtpLineID);
          text[fmtpLineID] = 'a=fmtp:' + id + ' maxplaybackrate=8000; sprop-maxcapturerate=8000';
          console.log('new fmtp line', text[fmtpLineID], fmtpLineID);
          payload.sdp.sdp = text.join('\r\n');
        }
      }

      this.network.signal('sdp', payload);
    }).catch(error => console.error('Error creating connection offer:', error));
  }

  createAnswer(sdp) {
    this.conn.createAnswer().then(answer => this.conn.setLocalDescription(answer)).then(() => {
      let payload = {
        to: this.uid,
        sdp: this.conn.localDescription.toJSON()
      };
      const text = this.conn.localDescription.sdp.split('\r\n');
      let opusLine = text.filter(l => l.includes('opus'));

      if (opusLine.length) {
        opusLine = opusLine[0];
        const id = opusLine.split(':')[1].split(' ')[0];
        console.log('opus line:', opusLine, id);
        const fmtpLineID = text.findIndex(l => l.startsWith('a=fmtp:' + id));

        if (fmtpLineID >= 0) {
          console.log('old fmtp line', text[fmtpLineID], fmtpLineID);
          text[fmtpLineID] = 'a=fmtp:' + id + ' maxplaybackrate=8000; sprop-maxcapturerate=8000';
          console.log('new fmtp line', text[fmtpLineID], fmtpLineID);
          payload.sdp.sdp = text.join('\r\n');
        }
      }

      this.network.signal('sdp', payload);
    }).catch(error => console.error('Error creating connection answer:', error));
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

class PeerNetwork extends EventEmitter {
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
      let _observe = observe({}),
          syncedData = _observe.object,
          eventEmitter = _observe.eventEmitter;

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

  connect(sigServURL) {
    var _this = this;

    return _asyncToGenerator(function* () {
      sigServURL = new URL(sigServURL); // TODO: Catch error

      yield new Promise((resolve, reject) => {
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
      _this.sigServ = io(sigServURL.origin);

      _this.sigServ.on('connect', () => {
        //console.log('Peer connected to signalling server');
        _this.emit('sigconnect');
      });

      _this.sigServ.on('disconnect', () => {
        //console.log('Peer disconnected from signalling server');
        _this.emit('sigdisconnect');
      });

      _this.sigServ.on('uid', uid => {
        //console.log('Peer UID is', uid);
        _this.ownUID = uid;

        _this.emit('uid', uid);
      });

      _this.sigServ.on('join', data => {
        //console.log('A peer with UID', data.uid, 'just joined the room', data.rid);
        if (!(data.uid in _this.peers)) {
          let peer = new Peer(data.uid, _this);
          peer.rooms.push(data.rid);
          peer.on('datachannelopen', peer => _this.emit('connection', peer));
          peer.on('datachannelclose', peer => peer.disconnect());
          peer.on('disconnect', () => _this.emit('disconnection', peer));

          _this.stream.getTracks().forEach(track => peer.conn.addTrack(track, _this.stream));

          _this.peers[data.uid] = peer;
        }

        _this.sigServ.emit('hail', {
          to: data.uid,
          rid: data.rid
        });
      });

      _this.sigServ.on('hail', data => {
        //console.log('A peer with UID', data.from, 'just hailed from', data.rid);
        if (data.from in _this.peers) {
          _this.peers[data.from].rooms.push(data.rid);

          return;
        }

        let peer = new Peer(data.from, _this);
        peer.rooms.push(data.rid);
        peer.on('datachannelopen', peer => _this.emit('connection', peer));
        peer.on('datachannelclose', peer => peer.disconnect());
        peer.on('disconnect', () => _this.emit('disconnection', peer));
        peer.createDataChannel(_this.ownUID + '_' + data.from);

        _this.stream.getTracks().forEach(track => peer.conn.addTrack(track, _this.stream));

        peer.createOffer();
        _this.peers[data.from] = peer;
      });

      _this.sigServ.on('sdp', data => {
        let sdp = data.sdp; //console.log('SDP', sdp.type, 'received from peer with UID', data.from);

        console.log('got sdp', sdp);
        if (_this.peers[data.from] == null) return;

        _this.peers[data.from].conn.setRemoteDescription(new RTCSessionDescription(sdp));

        if (sdp.type === 'offer') _this.peers[data.from].createAnswer(sdp);
      });

      _this.sigServ.on('ice', data => {
        //console.log('ICE data received from peer with UID', data.from);
        if (_this.peers[data.from] == null) return;

        _this.peers[data.from].conn.addIceCandidate(new RTCIceCandidate(data.candidate));
      });

      _this.sigServ.on('roomcast', data => {
        // TODO: Error handling
        let roomID = data.rid,
            objectPath = data.objectPath,
            value = data.value;
        objectPath = objectPath.substr(1).split('.');
        let prop = objectPath.pop();

        let object = _this.rooms[roomID.substr(1)].syncedData;

        while (objectPath.length) object = object[objectPath.shift()];

        object[prop] = value;
      });

      _this.sigServ.on('leave', data => {
        if (!(data.uid in _this.peers)) return;
        let peer = _this.peers[data.uid];

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

      return _this;
    })();
  }

}

exports.default = PeerNetwork;
