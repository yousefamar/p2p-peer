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

const iceServers = [{
  url: 'stun:stun.l.google.com:19302'
}, {
  url: 'stun:stun1.l.google.com:19302'
}, {
  url: 'stun:stun2.l.google.com:19302'
}, {
  url: 'stun:stun3.l.google.com:19302'
}, {
  url: 'stun:stun4.l.google.com:19302'
}, {
  url: 'stun:stun.services.mozilla.com'
}, {
  url: 'stun:23.21.150.121'
}, {
  url: 'stun:stun.anyfirewall.com:3478'
}, {
  url: 'stun:stun01.sipphone.com'
}, {
  url: 'stun:stun.ekiga.net'
}, {
  url: 'stun:stun.fwdnet.net'
}, {
  url: 'stun:stun.ideasip.com'
}, {
  url: 'stun:stun.iptel.org'
}, {
  url: 'stun:stun.rixtelecom.se'
}, {
  url: 'stun:stun.schlund.de'
}, {
  url: 'stun:stunserver.org'
}, {
  url: 'stun:stun.softjoys.com'
}, {
  url: 'stun:stun.voiparound.com'
}, {
  url: 'stun:stun.voipbuster.com'
}, {
  url: 'stun:stun.voipstunt.com'
}, {
  url: 'stun:stun.voxgratia.org'
}, {
  url: 'stun:stun.xten.com'
}, {
  url: 'turn:turn.bistri.com:80',
  credential: 'homeo',
  username: 'homeo'
}, {
  url: 'turn:turn.anyfirewall.com:443?transport=tcp',
  credential: 'webrtc',
  username: 'webrtc'
}, {
  url: 'turn:numb.viagenie.ca',
  credential: 'muazkh',
  username: 'webrtc@live.com'
}, {
  url: 'turn:192.158.29.39:3478?transport=udp',
  credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
  username: '28224511:1379330808'
}, {
  url: 'turn:192.158.29.39:3478?transport=tcp',
  credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=',
  username: '28224511:1379330808'
}];

class Peer extends EventTarget {
  constructor(uid, network) {
    super();
    var self = this;
    this.uid = uid;
    this.network = network;
    this.rooms = [];
    let conn = this.conn = new RTCPeerConnection({
      iceServers: iceServers
    });

    conn.onicecandidate = event => {
      if (event.candidate != null) {
        self.network.signal('ice', {
          candidate: event.candidate,
          to: self.uid
        });
      }
    };

    conn.ondatachannel = event => {
      self.ondatachannel(event.channel);
    };
  }

  createOffer() {
    var self = this;
    this.conn.createOffer(sdp => {
      self.conn.setLocalDescription(sdp);
      self.network.signal('sdp', {
        sdp: sdp,
        to: self.uid
      });
    }, () => {});
  }

  createAnswer(sdp) {
    var self = this;
    this.conn.createAnswer(sdp => {
      self.conn.setLocalDescription(sdp);
      self.network.signal('sdp', {
        sdp: sdp,
        to: self.uid
      });
    }, () => {});
  }

  createDataChannel(label) {
    var self = this;
    let dataChannel = this.dataChannel = this.conn.createDataChannel(label);

    dataChannel.onerror = error => console.error("Peer " + self.uid + " DataChannel Error:", error);

    dataChannel.onopen = () => self.dispatchEvent(new Event('datachannelopen'));

    dataChannel.onclose = () => self.dispatchEvent(new Event('datachannelclose'));

    dataChannel.onmessage = event => self.onmessage(JSON.parse(event.data));

    return dataChannel;
  }

  ondatachannel(channel) {
    var self = this;
    let dataChannel = this.dataChannel = channel;

    dataChannel.onerror = error => console.error("Peer " + self.uid + " DataChannel Error:", error);

    dataChannel.onopen = () => self.dispatchEvent(new Event('datachannelopen'));

    dataChannel.onclose = () => self.dispatchEvent(new Event('datachannelclose'));

    dataChannel.onmessage = event => self.onmessage(JSON.parse(event.data));
  }

  onmessage(message) {
    this.dispatchEvent(new CustomEvent('message', {
      detail: message
    }));
    this.dispatchEvent(new CustomEvent(message.event, {
      detail: message.data
    }));
  }

  send(event, data) {
    if (this.dataChannel == null) return;
    this.dataChannel.send(JSON.stringify({
      event: event,
      data: data
    }));
  }

  disconnect() {
    if (!(this.uid in this.network.peers)) return;
    this.rooms = [];
    delete this.network.peers[this.uid];
    if (this.dataChannel != null) this.dataChannel.close();
    if (this.conn.signalingState !== 'closed') this.conn.close();
    this.dispatchEvent(new Event('disconnect'));
  }

}

class PeerNetwork extends EventTarget {
  constructor() {
    super();
  }

  connect(sigServUrl) {
    var _this = this;

    return _asyncToGenerator(function* () {
      var self = _this;
      sigServUrl = new URL(sigServUrl);
      _this.ownUid = null;
      _this.peers = {}; // TODO: Catch error

      yield new Promise((resolve, reject) => {
        let script = document.createElement('script');
        script.type = 'text/javascript';
        sigServUrl.pathname = '/socket.io/socket.io.js';
        script.src = sigServUrl.href;
        script.addEventListener('load', resolve, false);
        script.addEventListener('error', reject, false);
        document.body.appendChild(script);
      });
      let sigServ = _this.sigServ = io(sigServUrl.origin);
      sigServ.on('connect', () => {});
      sigServ.on('uid', uid => {
        self.ownUid = uid;

        _this.dispatchEvent(new CustomEvent('uid', {
          detail: uid
        }));
      });
      sigServ.on('join', data => {
        if (!(data.uid in self.peers)) {
          let peer = self.peers[data.uid] = new Peer(data.uid, self);
          peer.rooms.push(data.rid);
          peer.addEventListener('datachannelopen', event => self.dispatchEvent(new CustomEvent('connection', {
            detail: peer
          })));
          peer.addEventListener('datachannelclose', event => peer.disconnect());
        }

        sigServ.emit('hail', {
          to: data.uid,
          rid: data.rid
        });
      });
      sigServ.on('hail', data => {
        if (!(data.from in self.peers)) {
          let peer = self.peers[data.from] = new Peer(data.from, self);
          peer.rooms.push(data.rid);
          peer.addEventListener('datachannelopen', event => self.dispatchEvent(new CustomEvent('connection', {
            detail: peer
          })));
          peer.addEventListener('datachannelclose', event => peer.disconnect());
          peer.createDataChannel(self.ownUid + "_" + data.from);
          peer.createOffer();
        } else {
          self.peers[data.from].rooms.push(data.rid);
        }
      });
      sigServ.on('sdp', data => {
        var sdp = data.sdp;
        var peer;
        if ((peer = self.peers[data.from]) != null) peer.conn.setRemoteDescription(new RTCSessionDescription(sdp));
        if (sdp.type === 'offer') peer.createAnswer(sdp);
      });
      sigServ.on('ice', data => {
        var peer;
        if ((peer = self.peers[data.from]) != null) peer.conn.addIceCandidate(new RTCIceCandidate(data.candidate));
      });
      sigServ.on('leave', data => {
        if (!(data.uid in self.peers)) return;
        var peer = self.peers[data.uid];

        if (data.rid == null) {
          peer.disconnect();
          return;
        }

        if (!(data.rid in peer.rooms)) return;
        peer.rooms.splice(peer.rooms.indexOf(data.rid), 1);
        if (!(peer.rooms.length < 1)) return;
        peer.disconnect();
      });
      sigServ.on('disconnect', () => {});
    })();
  }

  signal(event, data) {
    this.sigServ.emit(event, data);
  }

  join(roomId) {
    this.sigServ.emit('join', {
      rid: roomId
    });
  }

  leave(roomId) {
    this.sigServ.emit('leave', {
      rid: roomId
    });
  }

}

export default PeerNetwork;
