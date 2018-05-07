const path = require('path')
const levelup = require('levelup')
const leveldown = require('leveldown')

class Database {
  constructor () {
    this.database = levelup(leveldown(path.resolve(__dirname, '../../database')))
  }

  async getUTF8 (id) {
    const value = await this.database.get(id)

    return value.toString('UTF8')
  }

  async getObject (id) {
    const value = await this.database.get(id)

    return JSON.parse(value.toString('UTF8'))
  }

  setUTF8 (id, value) {
    return this.database.put(id, value)
  }

  setObject (id, value) {
    return this.database.put(id, JSON.stringify(value))
  }
}

module.exports = new Database()