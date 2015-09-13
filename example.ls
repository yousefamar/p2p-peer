require! { \./peer.ls : { PeerNetwork } }

log = !-> console.log it

peer-net = new PeerNetwork 'localhost:9987' \test
  ..on \connection (peer) !->
    log "Client: Peer #{peer.uid} connected"

    peer
      ..on \greeting (message) !->
        log "Peer #{peer.uid}: #message"

    log "Peer #{peer-net.own-uid} (us): Hi from #{peer-net.own-uid}!"
    peer.send \greeting "Hi from #{peer-net.own-uid}!"

  ..on \disconnection (peer) !->
    log "Client: Peer #{peer.uid} disconnected"
