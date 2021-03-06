const axios = require('axios')
const arkjs = require('arkjs')
const isUrl = require('is-url')
const isReachable = require('is-reachable')
const { sample, orderBy } = require('lodash')
const logger = require('./logger')
const networks = require('../config/networks')

class Network {
  async setNetwork (network) {
    this.network = networks[network]

    await this.__loadRemotePeers()

    arkjs.crypto.setNetworkVersion(this.network.version)

    return this.network
  }

  async setServer (server) {
    if (!server) {
      server = await this.__getRandomPeer()
    }

    this.server = server

    return this.server
  }

  async getFromNode (url, params = {}, peer = null) {
    const nethash = this.network ? this.network.nethash : null

    if (!this.peer && !this.server) {
      await this.setServer()
    }

    peer = await this.__selectResponsivePeer(peer || this.server)

    if (!url.startsWith('http')) {
      url = `http://${peer}${url}`
    }

    try {
      logger.info(`Sending request on "${this.network.name}" to "${url}"`)

      return axios.get(url, {
        params,
        headers: {
          nethash,
          version: '2.0.0',
          port: 1
        }
      })
    } catch (error) {
      logger.error(error.message)
    }
  }

  async findAvailablePeers () {
    try {
      const response = await this.getFromNode('/peer/list')

      let { networkHeight, peers } = this.__filterPeers(response.data.peers)

      if (process.env.NODE_ENV === 'test') {
        peers = peers.slice(0, 10)
      }

      let responsivePeers = []
      for (let i = 0; i < peers.length; i++) {
        const response = await this.getFromNode(`/peer/status`, {}, peers[i])

        if (Math.abs(response.data.height - networkHeight) <= 10) {
          responsivePeers.push(peers[i])
        }
      }

      this.network.peers = responsivePeers
    } catch (error) {
      logger.error(error.message)
    }
  }

  async postTransaction (transaction, peer) {
    const server = peer || this.server

    return axios.post(`http://${server}/peer/transactions`, {
      transactions: [transaction]
    }, {
      headers: {
        nethash: this.network.nethash,
        version: '1.0.0',
        port: 1
      }
    })
  }

  async broadcast (transaction) {
    const peers = this.network.peers.slice(0, 10)

    for (let i = 0; i < peers.length; i++) {
      logger.info(`Broadcasting to ${peers[i]}`)

      await this.postTransaction(transaction, peers[i])
    }
  }

  async connect (network) {
    if (this.server) {
      logger.info(`Server is already configured as "${this.server}"`)
    }

    if (this.network && this.network.name === network) {
      logger.info(`Network is already configured as "${this.network.name}"`)
    }

    const configured = this.server && this.network && (this.network.name && this.network.name === network)

    if (!configured) {
      this.setNetwork(network)
      this.setServer()

      await this.findAvailablePeers()

      try {
        const response = await this.getFromNode('/api/loader/autoconfigure')

        this.network.config = response.data.network
      } catch (error) {
        return this.connect(network)
      }
    }
  }

  async __getRandomPeer () {
    await this.__loadRemotePeers()

    return sample(this.network.peers)
  }

  async __loadRemotePeers () {
    if (isUrl(this.network.peers)) {
      const response = await axios.get(this.network.peers)

      this.network.peers = response.data.map(peer => `${peer.ip}:${peer.port}`)
    }
  }

  __filterPeers (peers) {
    let filteredPeers = peers
      .filter(peer => peer.status === 'OK')
      .filter(peer => peer.ip !== '127.0.0.1')

    filteredPeers = orderBy(filteredPeers, ['height', 'delay'], ['desc', 'asc'])

    const networkHeight = filteredPeers[0].height

    return {
      networkHeight,
      peers: filteredPeers
        .filter(peer => Math.abs(peer.height - networkHeight) <= 10)
        .map(peer => (`${peer.ip}:${peer.port}`))
    }
  }

  async __selectResponsivePeer (peer) {
    const reachable = await isReachable(peer)

    if (!reachable) {
      logger.warn(`${peer} is unresponsive. Choosing new peer.`)

      const randomPeer = await this.__getRandomPeer()

      return this.__selectResponsivePeer(randomPeer)
    }

    return peer
  }
}

module.exports = new Network()
