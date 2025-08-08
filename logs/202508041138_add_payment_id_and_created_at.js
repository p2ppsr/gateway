// migrations/202508041152_add_payment_id.js

exports.up = function (knex) {
  return knex.schema.table('payment_buttons', function (table) {
    table.string('payment_id', 16).nullable()
  })
}

exports.down = function (knex) {
  return knex.schema.table('payment_buttons', function (table) {
    table.dropColumn('payment_id')
  })
}
