const mongoose = require('mongoose')

const GameWeekSchema = new mongoose.Schema({
    week: Date,
    players:[{name: String, ratings: Array}]
}
, {collection: 'weeks', timestamps: true})

const model = mongoose.model('Week', GameWeekSchema)

module.exports = model