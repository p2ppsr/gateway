exports.up = function (knex) {
  return knex.schema.table('payment_buttons', function (table) {
    table.text('customCSS').nullable()
  })
}

exports.down = function (knex) {
  return knex.schema.table('payment_buttons', function (table) {
    table.dropColumn('customCSS')
  })
}
