# TODO: Check these
ice-servers =
  { url: 'stun:stun.l.google.com:19302' }
  { url: 'stun:stun1.l.google.com:19302' }
  { url: 'stun:stun2.l.google.com:19302' }
  { url: 'stun:stun3.l.google.com:19302' }
  { url: 'stun:stun4.l.google.com:19302' }
  { url: 'stun:stun.services.mozilla.com' }
  { url: 'stun:23.21.150.121' }
  { url: 'stun:stun.anyfirewall.com:3478' }
  { url: 'stun:stun01.sipphone.com' }
  { url: 'stun:stun.ekiga.net' }
  { url: 'stun:stun.fwdnet.net' }
  { url: 'stun:stun.ideasip.com' }
  { url: 'stun:stun.iptel.org' }
  { url: 'stun:stun.rixtelecom.se' }
  { url: 'stun:stun.schlund.de' }
  { url: 'stun:stunserver.org' }
  { url: 'stun:stun.softjoys.com' }
  { url: 'stun:stun.voiparound.com' }
  { url: 'stun:stun.voipbuster.com' }
  { url: 'stun:stun.voipstunt.com' }
  { url: 'stun:stun.voxgratia.org' }
  { url: 'stun:stun.xten.com' }
  { url: 'turn:turn.bistri.com:80' credential: 'homeo' username: 'homeo' }
  { url: 'turn:turn.anyfirewall.com:443?transport=tcp' credential: 'webrtc' username: 'webrtc' }
  { url: 'turn:numb.viagenie.ca' credential: 'muazkh' username: 'webrtc@live.com' }
  { url: 'turn:192.158.29.39:3478?transport=udp' credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=' username: '28224511:1379330808' }
  { url: 'turn:192.158.29.39:3478?transport=tcp' credential: 'JZEOEt2V3Qb0y27GRntt2u2PAYA=' username: '28224511:1379330808' }

#log = !-> console.log it

require! { events: EventEmitter, \webrtc-adapter-test, \socket.io-client : io }

export class PeerNetwork extends EventEmitter
  (sig-serv-url) ->
    @own-uid = null

    @peers = {}

    self = @

    @sig-serv = io sig-serv-url
      ..on \connect !->
        #log 'Client: Connected to signalling server'

      ..on \uid (uid) !->
        #log "Signalling Server: Your UID is #uid"
        self.own-uid := uid
        self.emit \uid uid

      ..on \join (data) !->
        #log "Signalling Server: A peer with UID #{data.uid} just joined the room #{data.rid}"
        unless data.uid of self.peers
          self.peers[data.uid] = new Peer data.uid, self
            ..rooms.push data.rid
            ..on \datachannelopen  !-> self.emit \connection it
            ..on \datachannelclose !-> it.disconnect!
        @emit \hail to: data.uid, rid: data.rid

      ..on \hail (data) !->
        #log "Signalling Server: A peer with UID #{data.from} just hailed us from #{data.rid}"
        unless data.from of self.peers
          self.peers[data.from] = new Peer data.from, self
            ..rooms.push data.rid
            ..on \datachannelopen  !-> self.emit \connection it
            ..on \datachannelclose !-> it.disconnect!
            ..create-data-channel "#{self.own-uid}_#{data.from}"
            ..create-offer!
        else
          self.peers[data.from].rooms.push data.rid

      ..on \sdp (data) !->
        sdp = data.sdp
        #log "Signalling Server: SDP #{sdp.type} received from peer with UID #{data.from}"
        self.peers[data.from]?.conn.set-remote-description new RTCSessionDescription sdp
        if sdp.type is \offer then self.peers[data.from]?.create-answer sdp

      ..on \ice (data) !->
        #log "Signalling Server: ICE data received from peer with UID #{data.from}"
        self.peers[data.from]?.conn.add-ice-candidate new RTCIceCandidate data.candidate

      ..on \leave (data) !->
        return unless data.uid of self.peers
        peer = self.peers[data.uid]
        unless data.rid?
          #log "Signalling Server: A peer with UID #{data.uid} just left all rooms"
          peer.disconnect!
          return
        return unless data.rid of peer.rooms
        #log "Signalling Server: A peer with UID #{data.uid} just left the room #{data.rid}"
        data.rid |> peer.rooms.index-of |> peer.rooms.splice _, 1
        return unless peer.rooms.length < 1
        peer.disconnect!

      ..on \disconnect !->
        #log 'Client: Disconnected from signalling server'

  signal: (event, data) !-> @sig-serv.emit event, data

  join: (room-id) !->
    #log "Client: Joining room '#room-id'"
    @sig-serv.emit \join rid: room-id

  leave: (room-id) !->
    #log "Client: Leaving room '#room-id'"
    @sig-serv.emit \leave rid: room-id


class Peer extends EventEmitter
  (@uid, @network) ->
    @rooms = []
    self = @
    @conn = new RTCPeerConnection { ice-servers }
      ..onicecandidate = (event) !-> if event.candidate? then self.network.signal \ice { event.candidate, to: self.uid }
      ..ondatachannel = (event) !-> self.ondatachannel event.channel

  create-offer: !->
    self = @
    sdp <-! @conn.create-offer
    self.conn.set-local-description sdp
    self.network.signal \sdp, { sdp, to: self.uid }

  create-answer: (sdp) !->
    self = @
    sdp <-! @conn.create-answer
    self.conn.set-local-description sdp
    self.network.signal \sdp, { sdp, to: self.uid }

  create-data-channel: (label) ->
    self = @
    @data-channel = @conn.create-data-channel label
      ..onerror = !-> console.error "Peer #{self.uid} DataChannel Error:", it
      ..onopen  = !-> self.emit \datachannelopen  self
      ..onclose = !-> self.emit \datachannelclose self
      ..onmessage = (event) !-> event.data |> JSON.parse |> self.onmessage

  ondatachannel: (channel) !->
    self = @
    @data-channel = channel
      ..onerror = !-> console.error "Peer #{self.uid} DataChannel Error:", it
      ..onopen  = !-> self.emit \datachannelopen  self
      ..onclose = !-> self.emit \datachannelclose self
      ..onmessage = (event) !-> event.data |> JSON.parse |> self.onmessage

  onmessage: !->
    @emit \message it
    @emit it.event, it.data

  send: (event, data) !-> { event, data } |> JSON.stringify |> @data-channel?.send

  disconnect: !->
    return unless @uid of @network.peers
    @rooms = []
    delete @network.peers[@uid]
    @data-channel?.close!
    @conn.close! unless @conn.signaling-state is \closed
    @emit \disconnect
