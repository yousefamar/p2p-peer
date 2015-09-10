RTCPeerConnection     = window.webkitRTCPeerConnection or window.mozRTCPeerConnection
RTCIceCandidate       = window.RTCIceCandidate or window.mozRTCIceCandidate
RTCSessionDescription = window.RTCSessionDescription or window.mozRTCSessionDescription

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

require! { events: EventEmitter, \socket.io-client : io }

export class PeerNetwork extends EventEmitter
  (sig-serv-url, room-id) ->
    @own-uid = null

    peers   = {}

    self = @

    @sig-serv = io 'localhost:9980'
      ..on \connect !->
        #log 'Client: Connected to signalling server'

      ..on \uid (uid) !->
        #log "Signalling Server: Your UID is #uid"
        self.own-uid := uid
        #log "Client: Joining room '#room-id'"
        self.sig-serv.emit \join rid: room-id

      ..on \join (uid) !->
        #log "Signalling Server: A peer with UID #uid just joined the room"
        peers[uid] = new Peer uid, self
          ..on \datachannelopen  !-> self.emit \connection it
          ..on \datachannelclose !-> delete peers[it.uid] and self.emit \disconnection it
          ..create-data-channel "#{uid}_#{self.own-uid}"
          ..rtc-peer.create-offer!

      ..on \sdp (data) !->
        sdp = data.sdp
        #log "Signalling Server: SDP #{sdp.type} received from peer with UID #{data.from}"
        if sdp.type is \offer
          peers[data.from] = new Peer data.from, self
            ..on \datachannelopen  !-> self.emit \connection it
            ..on \datachannelclose !-> delete peers[it.uid] and self.emit \disconnection it
            ..create-data-channel "#{self.own-uid}_#{data.from}"
            ..rtc-peer.create-answer sdp
        else if sdp.type is \answer
          peers[data.from]?.rtc-peer.set-remote-description sdp

      ..on \ice (data) !->
        #log "Signalling Server: ICE data received from peer with UID #{data.from}"
        peers[data.from]?.rtc-peer.add-ice-candidate data.candidate

      ..on \part (uid) !->
        #log "Signalling Server: A peer with UID #uid just left the room"
        peer = delete peers[uid]
        self.emit \disconnection peer if peer

      ..on \disconnect !->
        #log 'Client: Disconnected from signalling server'

  signal: (event, data) !-> @sig-serv.emit event, data

class Peer extends EventEmitter
  (@uid, @network) ->
    @rtc-peer = new RTCPeer uid, @

  create-data-channel: (label) ->
    self = @
    @data-channel = @rtc-peer.conn.create-data-channel label, reliable: true
      ..onerror = !-> console.error "Peer #{self.uid} DataChannel Error:", it
      ..onopen  = !-> self.emit \datachannelopen  self
      ..onclose = !-> self.emit \datachannelclose self
      ..onmessage = (event) !-> event.data |> JSON.parse |> !-> self.emit it.event, it.data

  send: (event, data) !-> { event, data } |> JSON.stringify |> @data-channel.send

class RTCPeer

  media-constraints =
    optional: []
    mandatory:
      OfferToReceiveAudio: false
      OfferToReceiveVideo: false

  (@uid, @peer) ->
    self = @
    @conn = new RTCPeerConnection { ice-servers }, { optional: [ { +DtlsSrtpKeyAgreement }, { +RtpDataChannels } ] }
      ..onicecandidate = (event) !->
        if event.candidate
          self.onicecandidate event.candidate
          return
        self.onsdp @local-description
      ..ongatheringchange = (event) !->
        return unless event.current-target and event.current-target.ice-gathering-state is \complete
        self.onsdp @local-description

  create-offer: !->
    self = @
    sdp <-! @conn.create-offer _, @on-sdp-error, media-constraints
    self.conn.set-local-description sdp
    self.onsdp sdp

  create-answer: (sdp) !->
    @set-remote-description new RTCSessionDescription sdp, @on-sdp-success, @on-sdp-error
    self = @
    sdp <-! @conn.create-answer _, @on-sdp-error, media-constraints
    self.conn.set-local-description sdp
    self.onsdp sdp

  set-remote-description: (sdp) !->
    @conn.set-remote-description new RTCSessionDescription sdp, @on-sdp-success, @on-sdp-error

  add-ice-candidate: (candidate) !->
    @conn.add-ice-candidate new RTCIceCandidate { candidate.sdp-m-line-index, candidate.candidate }

  onicecandidate: (candidate) !-> @peer.network.signal \ice, { candidate, to: @uid }
  onsdp: (sdp) !-> @peer.network.signal \sdp, { sdp, to: @uid }
  on-sdp-success = ->
  on-sdp-error = !-> console.error 'SDP error:', it.name, it.message
