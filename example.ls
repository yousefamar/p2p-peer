require! { \./peer.ls : { PeerNetwork } }

log = !-> console.log it

peer-net = new PeerNetwork 'localhost:9987'
  ..on \connection (peer) !->
    log "Peer #{peer.uid} connected"

    peer
      ..on \greeting (message) !->
        log "Peer #{peer.uid}: #message"
      ..on \disconnect !->
        log "Peer #{peer.uid} disconnected"

    log "Peer #{peer-net.own-uid} (us): Hi from #{peer-net.own-uid}!"
    peer.send \greeting "Hi from #{peer-net.own-uid}!"

  ..on \uid (uid) !->
    @join \test
