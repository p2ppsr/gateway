const F = 'migrations/20250827_schema_updates'

exports.up = async function (knex) {
  console.log(`${F}: Running schema updates migration`)

  // 1. Drop payment_buttons.description
  await knex.schema.alterTable('payment_buttons', table => {
    table.dropColumn('description')
  })
  console.log(`${F}: Dropped payment_buttons.description`)

  // 2. Modify payment_buttons.html_code to NOT NULL
  await knex.schema.alterTable('payment_buttons', table => {
    table
      .text('html_code')
      .notNullable()
      .defaultTo('<div>Pay Now</div>')
      .alter()
  })
  console.log(
    `${F}: Modified payment_buttons.html_code to NOT NULL with default`
  )

  // 3. Drop payment_buttons.total_paid
  await knex.schema.alterTable('payment_buttons', table => {
    table.dropColumn('total_paid')
  })
  console.log(`${F}: Dropped payment_buttons.total_paid`)
}

exports.down = async function (knex) {
  console.log(`${F}: Reverting schema updates migration`)

  // Revert: Add payment_buttons.description
  await knex.schema.alterTable('payment_buttons', table => {
    table.string('description', 80).nullable()
  })
  console.log(`${F}: Restored payment_buttons.description`)

  // Revert: Make payment_buttons.html_code nullable
  await knex.schema.alterTable('payment_buttons', table => {
    table.text('html_code').nullable().alter()
  })
  console.log(`${F}: Reverted payment_buttons.html_code to nullable`)

  // Revert: Add payment_buttons.total_paid
  await knex.schema.alterTable('payment_buttons', table => {
    table.bigint('total_paid').unsigned().defaultTo(0)
  })
  console.log(`${F}: Restored payment_buttons.total_paid`)
}
